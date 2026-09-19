"use client";

import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/client";
import { ErrorState, PageHeader, cn } from "@/components/portal/shared";
import { AccountTab } from "@/components/portal/user/settings/settings-account";
import { ProfileTab } from "@/components/portal/user/settings/settings-profile";
import { UsersTab } from "@/components/portal/user/settings/settings-users";
import { EsignTab } from "@/components/portal/user/settings/settings-esign";
import { NotificationsTab } from "@/components/portal/user/settings/settings-notifications";
import { SmsTab } from "@/components/portal/user/settings/settings-sms";
import { ApiTab } from "@/components/portal/user/settings/settings-api";
import { McpTab } from "@/components/portal/user/settings/settings-mcp";
import { BillingTab } from "@/components/portal/user/settings/settings-billing";
import { SsoTab } from "@/components/portal/user/settings/settings-sso";

export const SETTINGS_TABS = [
  { key: "account", label: "Account" },
  { key: "profile", label: "Profile" },
  { key: "users", label: "Users" },
  { key: "billing", label: "Billing" },
  { key: "sso", label: "SSO" },
  { key: "esign", label: "eSign" },
  { key: "notifications", label: "Notifications" },
  { key: "sms", label: "SMS" },
  { key: "api", label: "API" },
  { key: "mcp", label: "MCP" },
] as const;

export type SettingsTabKey = (typeof SETTINGS_TABS)[number]["key"];

export function UserSettings({ tab, onTabChange }: { tab: SettingsTabKey; onTabChange: (t: SettingsTabKey) => void }) {
  const { isError, error, refetch } = useQuery({
    queryKey: ["workspace", "settings"],
    queryFn: () => apiGet<unknown>("/api/workspace/settings"),
    staleTime: 10_000,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Account & security, profile & signatures, users, digital signatures (eSign), notifications, SMS delivery, API and MCP - every change is persisted and audit-logged."
      />

      {/* Tab bar - each tab is a real URL (/settings/{tab}) so it can be
          deep-linked, bookmarked and restored with the back button. */}
      <nav aria-label="Settings sections" className="docurama-scroll -mx-1 flex gap-1 overflow-x-auto pb-1">
        {SETTINGS_TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => onTabChange(t.key)}
            aria-current={tab === t.key ? "true" : undefined}
            className={cn(
              "min-h-10 shrink-0 rounded-lg px-4 text-sm font-medium transition-colors",
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-foreground/80 hover:bg-accent hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-ring",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {/* One mounted tab at a time - each fetches exactly its own data. */}
      {tab === "account" && <AccountTab />}
      {tab === "profile" && <ProfileTab />}
      {tab === "users" && <UsersTab />}
      {tab === "billing" && <BillingTab />}
      {tab === "sso" && <SsoTab />}
      {tab === "esign" && <EsignTab />}
      {tab === "notifications" && <NotificationsTab />}
      {tab === "sms" && <SmsTab />}
      {tab === "api" && <ApiTab />}
      {tab === "mcp" && <McpTab />}

      {isError && (
        <div className="mt-4">
          <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
        </div>
      )}
    </div>
  );
}
