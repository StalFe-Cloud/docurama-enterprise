"use client";

/**
 * Docurama enterprise portal - path-driven application root.
 *
 * Every section is a real URL (deep-linkable, back-button friendly):
 *   Workspace:  /  /documents  /templates  /verify  /settings/{tab}
 *   Admin:      /admin/{section}
 *
 * Navigation uses window.history.pushState - Next's App Router keeps
 * usePathname in sync without a server round-trip, so switching sections is
 * instant while every path still renders the full app on a hard load.
 */

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client";
import { PortalProviders } from "@/components/portal/providers";
import { SignIn } from "@/components/portal/sign-in";
import { AdminShell, ADMIN_SECTIONS, type AdminSectionKey } from "@/components/portal/admin-shell";
import { UserShell, USER_SECTIONS, type UserSectionKey } from "@/components/portal/user-shell";
import { AdminOverview } from "@/components/portal/admin/admin-overview";
import { AdminTenants } from "@/components/portal/admin/admin-tenants";
import { AdminUsers } from "@/components/portal/admin/admin-users";
import { AdminEnvelopes } from "@/components/portal/admin/admin-envelopes";
import { AdminDomains } from "@/components/portal/admin/admin-domains";
import { AdminLegal } from "@/components/portal/admin/admin-legal";
import { AdminCompliance } from "@/components/portal/admin/admin-compliance";
import { AdminBilling } from "@/components/portal/admin/admin-billing";
import { AdminIntegrations } from "@/components/portal/admin/admin-integrations";
import { AdminProvisioning } from "@/components/portal/admin/admin-provisioning";
import { AdminSettings } from "@/components/portal/admin/admin-settings";
import { AdminHealth } from "@/components/portal/admin/admin-health";
import { AdminAudit } from "@/components/portal/admin/admin-audit";
import { UserHome } from "@/components/portal/user/user-home";
import { UserDocuments } from "@/components/portal/user/user-documents";
import { UserTemplates } from "@/components/portal/user/user-templates";
import { UserVerify } from "@/components/portal/user/user-verify";
import { UserSettings, SETTINGS_TABS, type SettingsTabKey } from "@/components/portal/user/user-settings";
import type { SessionUser } from "@/lib/auth";
import { BrandMark } from "@/components/brand/logo";

const ADMIN_KEYS = ADMIN_SECTIONS.map((s) => s.key) as string[];
const USER_KEYS = USER_SECTIONS.map((s) => s.key) as string[];

export function pushPath(path: string) {
  window.history.pushState({}, "", path);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

function Portal({ user }: { user: SessionUser }) {
  const nextPathname = usePathname() || "/";
  const [navPath, setNavPath] = useState<string | null>(null);
  const pathname = navPath ?? nextPathname;

  useEffect(() => {
    const onPop = () => setNavPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const isAdmin = user.role === "PLATFORM_ADMIN";

  // ── Derive the active section from the URL (single source of truth) ──
  let adminSection: AdminSectionKey = "overview";
  let userSection: UserSectionKey = "home";
  let settingsTab: SettingsTabKey = "account";

  if (isAdmin) {
    const m = pathname.match(/^\/admin\/([a-z-]+)/);
    if (m && ADMIN_KEYS.includes(m[1])) adminSection = m[1] as AdminSectionKey;
  } else {
    const s = pathname.match(/^\/settings(?:\/([a-z]+))?/);
    if (s) {
      userSection = "settings";
      const t = s[1];
      settingsTab = SETTINGS_TABS.some((tab) => tab.key === t) ? (t as SettingsTabKey) : "account";
    } else if (pathname.startsWith("/documents")) userSection = "documents";
    else if (pathname.startsWith("/templates")) userSection = "templates";
    else if (pathname.startsWith("/verify")) userSection = "verify";
  }

  // A stale hash from the old navigation scheme still routes correctly.
  useEffect(() => {
    const key = window.location.hash.replace("#", "");
    if (!key) return;
    if (!isAdmin && USER_KEYS.includes(key) && key !== userSection) {
      pushPath(key === "home" ? "/" : key === "settings" ? `/settings/${settingsTab}` : `/${key}`);
      window.location.hash = "";
    }
  }, []);

  const navigateAdmin = (k: AdminSectionKey) => pushPath(`/admin/${k}`);
  const navigateUser = (k: UserSectionKey) => {
    if (k === "settings") pushPath(`/settings/${settingsTab}`);
    else if (k === "home") pushPath("/");
    else pushPath(`/${k}`);
  };
  const navigateSettingsTab = (t: SettingsTabKey) => pushPath(`/settings/${t}`);

  if (isAdmin) {
    return (
      <AdminShell user={user} active={adminSection} onNavigate={navigateAdmin}>
        {adminSection === "overview" && <AdminOverview onNavigate={navigateAdmin} />}
        {adminSection === "tenants" && <AdminTenants />}
        {adminSection === "users" && <AdminUsers />}
        {adminSection === "envelopes" && <AdminEnvelopes />}
        {adminSection === "domains" && <AdminDomains />}
        {adminSection === "legal" && <AdminLegal />}
        {adminSection === "compliance" && <AdminCompliance />}
        {adminSection === "billing" && <AdminBilling />}
        {adminSection === "integrations" && <AdminIntegrations />}
        {adminSection === "provisioning" && <AdminProvisioning />}
        {adminSection === "settings" && <AdminSettings />}
        {adminSection === "health" && <AdminHealth />}
        {adminSection === "audit" && <AdminAudit />}
      </AdminShell>
    );
  }

  return (
    <UserShell user={user} active={userSection} onNavigate={navigateUser}>
      {userSection === "home" && <UserHome user={user} onNavigate={navigateUser} />}
      {userSection === "documents" && <UserDocuments />}
      {userSection === "templates" && <UserTemplates />}
      {userSection === "verify" && <UserVerify />}
      {userSection === "settings" && <UserSettings tab={settingsTab} onTabChange={navigateSettingsTab} />}
    </UserShell>
  );
}

function Boot() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background" role="status" aria-live="polite">
      <BrandMark className="h-12 w-12 animate-pulse" />
      <p className="text-sm text-muted-foreground">Loading Docurama portal…</p>
    </div>
  );
}

function App() {
  const { data, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["session"],
    queryFn: () => apiGet<{ user: SessionUser | null }>("/api/auth/me"),
    retry: 2,
    staleTime: 30_000,
  });

  if (isLoading) return <Boot />;

  // A network failure keeps the user where they are with a retry - it does
  // NOT silently sign them out.
  if (isError) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <p className="text-sm font-semibold">Cannot reach Docurama</p>
        <p className="max-w-sm text-sm text-muted-foreground">
          {(error as Error)?.message ?? "A network error occurred."} You have not been signed out - please try again.
        </p>
        <button
          type="button"
          onClick={() => refetch()}
          className="h-11 rounded-lg bg-primary px-5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!data?.user) return <SignIn />;
  return <Portal user={data.user} />;
}

export function PortalRoot() {
  return (
    <PortalProviders>
      <App />
    </PortalProviders>
  );
}
