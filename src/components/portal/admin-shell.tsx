"use client";

import { ReactNode, useState } from "react";
import { useTheme } from "next-themes";
import {
  LayoutDashboard, Building2, Users, FileSignature, Globe, Scale, ShieldCheck,
  CreditCard, Webhook, Settings2, HeartPulse, ScrollText, LogOut, Mail,
  Sun, Moon, Menu, ChevronDown, ExternalLink, Handshake,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, clearSessionToken } from "@/lib/client";
import { toast } from "sonner";
import type { SessionUser } from "@/lib/auth";
import { BrandMark, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export const ADMIN_SECTIONS = [
  { key: "overview", label: "Overview", icon: LayoutDashboard, desc: "Platform KPIs, health and activity" },
  { key: "tenants", label: "Tenants", icon: Building2, desc: "Customer workspaces, plans and lifecycle" },
  { key: "users", label: "Users", icon: Users, desc: "Directory, roles and 2FA posture" },
  { key: "envelopes", label: "Envelopes", icon: FileSignature, desc: "Global signing activity monitor" },
  { key: "domains", label: "Domains", icon: Globe, desc: "DNS attestation and join requests" },
  { key: "legal", label: "Legal & DSAR", icon: Scale, desc: "DMCA notices and data subject requests" },
  { key: "compliance", label: "Compliance", icon: ShieldCheck, desc: "Controls, retention, holds, incidents" },
  { key: "billing", label: "Billing", icon: CreditCard, desc: "Plans, subscriptions and revenue" },
  { key: "leads", label: "Enterprise Leads", icon: Handshake, desc: "Pipeline from the /enterprise page" },
  { key: "integrations", label: "API & Webhooks", icon: Webhook, desc: "Keys, endpoints and deliveries" },
  { key: "provisioning", label: "Email & DNS", icon: Mail, desc: "docurama.eu mailboxes, sub-domains, zone file" },
  { key: "settings", label: "Platform Settings", icon: Settings2, desc: "SMTP, TSA, feature flags" },
  { key: "health", label: "Ops Health", icon: HeartPulse, desc: "Service status and signing readiness" },
  { key: "audit", label: "Audit Log", icon: ScrollText, desc: "Immutable chain, security events" },
] as const;

export type AdminSectionKey = (typeof ADMIN_SECTIONS)[number]["key"];

function NavList({
  active, onNavigate,
}: { active: AdminSectionKey; onNavigate: (key: AdminSectionKey) => void }) {
  return (
    <nav aria-label="Admin sections" className="flex flex-col gap-0.5">
      {ADMIN_SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => onNavigate(s.key)}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive
                ? "bg-primary-soft text-primary"
                : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              "focus-visible:outline-2 focus-visible:outline-ring",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{s.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

function SidebarFooter({ onNavigate }: { onNavigate: (key: AdminSectionKey) => void }) {
  return (
    <div className="shrink-0 space-y-3 border-t px-3 py-4">
      <button
        type="button"
        onClick={() => onNavigate("overview")}
        className="flex w-full items-start gap-3 rounded-lg bg-primary-soft/60 p-3 text-left transition-colors hover:bg-primary-soft focus-visible:outline-2 focus-visible:outline-ring"
      >
        <ExternalLink className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="min-w-0">
          <span className="block text-xs font-semibold">Public verify portal</span>
          <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
            verify.docurama.eu - anyone can check a signed document
          </span>
        </span>
      </button>
      <p className="px-1 text-[11px] leading-snug text-muted-foreground">
        <span className="font-medium">{BRAND_LEGAL_NAME}</span>
        <span className="block">{BRAND_ADDRESS}</span>
      </p>
    </div>
  );
}

export function AdminShell({
  user, active, onNavigate, children,
}: {
  user: SessionUser;
  active: AdminSectionKey;
  onNavigate: (key: AdminSectionKey) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  const logout = async () => {
    await apiPost("/api/auth/logout", { op: "logout" }).catch(() => undefined);
    clearSessionToken(); // drop the bearer fallback token as well
    queryClient.invalidateQueries({ queryKey: ["session"] });
    toast.success("Signed out");
  };

  const headerTitle = ADMIN_SECTIONS.find((s) => s.key === active)?.label ?? "Overview";

  return (
    <div className="flex min-h-screen bg-muted/40">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar lg:flex">
        <div className="docurama-scroll min-h-0 flex-1 space-y-6 overflow-y-auto p-4">
          <div className="flex items-center gap-2.5 px-1 pt-1">
            <BrandMark className="h-9 w-9" />
            <div className="leading-tight">
              <p className="text-sm font-semibold tracking-tight">Docu<span className="text-primary">rama</span></p>
              <p className="text-[11px] text-muted-foreground">Platform Console</p>
            </div>
          </div>
          <NavList active={active} onNavigate={onNavigate} />
        </div>
        <SidebarFooter onNavigate={onNavigate} />
      </aside>

      {/* Main column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b bg-background/95 px-4 backdrop-blur sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile nav */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" aria-describedby={undefined} className="w-72 p-0">
                <SheetTitle className="sr-only">Admin navigation</SheetTitle>
                <div className="flex h-full flex-col justify-between">
                  <div className="space-y-6 p-4">
                    <div className="flex items-center gap-2.5">
                      <BrandMark className="h-9 w-9" />
                      <div className="leading-tight">
                        <p className="text-sm font-semibold tracking-tight">Docu<span className="text-primary">rama</span></p>
                        <p className="text-[11px] text-muted-foreground">Platform Console</p>
                      </div>
                    </div>
                    <div className="docurama-scroll max-h-[calc(100vh-220px)] overflow-y-auto">
                      <NavList
                        active={active}
                        onNavigate={(k) => { onNavigate(k); setMobileOpen(false); }}
                      />
                    </div>
                  </div>
                  <SidebarFooter onNavigate={(k) => { onNavigate(k); setMobileOpen(false); }} />
                </div>
              </SheetContent>
            </Sheet>

            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{headerTitle}</p>
              <p className="hidden truncate text-xs text-muted-foreground sm:block">
                {ADMIN_SECTIONS.find((s) => s.key === active)?.desc}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Button
              variant="ghost" size="icon" aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="h-11 w-11"
            >
              {theme === "dark" ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  className="flex min-h-11 items-center gap-2 rounded-lg px-2 transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  aria-label="Account menu"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium">{user.firstName} {user.lastName}</span>
                    <span className="block text-[11px] text-muted-foreground">Platform Admin</span>
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>
                  <p className="text-sm font-medium">{user.firstName} {user.lastName}</p>
                  <p className="text-xs font-normal text-muted-foreground">{user.email}</p>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={logout} variant="destructive">
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" className="docurama-scroll flex-1 space-y-6 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
