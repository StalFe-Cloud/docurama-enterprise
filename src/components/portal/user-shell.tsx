"use client";

import { ReactNode, useState } from "react";
import { useTheme } from "next-themes";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Home, Files, LayoutTemplate, BadgeCheck, Settings, LogOut, Sun, Moon, Menu, ChevronDown,
  Building2, Check, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { apiPost, clearSessionToken } from "@/lib/client";
import type { SessionUser } from "@/lib/auth";
import { BrandMark, BRAND_LEGAL_NAME, BRAND_ADDRESS } from "@/components/brand/logo";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export const USER_SECTIONS = [
  { key: "home", label: "Home", icon: Home },
  { key: "documents", label: "Documents", icon: Files },
  { key: "templates", label: "Templates", icon: LayoutTemplate },
  { key: "verify", label: "Verify", icon: BadgeCheck },
  { key: "settings", label: "Settings", icon: Settings },
] as const;

export type UserSectionKey = (typeof USER_SECTIONS)[number]["key"];

export function UserShell({
  user, active, onNavigate, children,
}: {
  user: SessionUser;
  active: UserSectionKey;
  onNavigate: (key: UserSectionKey) => void;
  children: ReactNode;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const initials = `${user.firstName[0] ?? ""}${user.lastName[0] ?? ""}`.toUpperCase();

  const logout = async () => {
    await apiPost("/api/auth/logout", { op: "logout" }).catch(() => undefined);
    clearSessionToken(); // drop the bearer fallback token as well
    queryClient.invalidateQueries({ queryKey: ["session"] });
    toast.success("Signed out");
  };

  // ── Multi-organization switching (Settings → Account) ──
  const switchOrg = async (tenantId: string, name: string) => {
    if (switching || tenantId === user.tenantId) return;
    setSwitching(true);
    try {
      await apiPost<{ ok: boolean; message: string }>("/api/workspace/settings", {
        op: "org.switch", data: { tenantId },
      });
      await queryClient.invalidateQueries({ queryKey: ["session"] });
      await queryClient.invalidateQueries({ queryKey: ["workspace"] });
      toast.success(`Switched to ${name}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not switch organization");
    } finally {
      setSwitching(false);
    }
  };

  const links = (
    <>
      {USER_SECTIONS.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.key;
        return (
          <button
            key={s.key}
            type="button"
            onClick={() => { onNavigate(s.key); setMobileOpen(false); }}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-foreground/80 hover:bg-accent hover:text-foreground",
              "focus-visible:outline-2 focus-visible:outline-ring",
              "w-full lg:w-auto",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" aria-hidden />
            {s.label}
          </button>
        );
      })}
    </>
  );

  return (
    <div className="flex min-h-screen flex-col bg-muted/40">
      <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            {/* Mobile menu - the original app had no mobile navigation at all */}
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="h-11 w-11 lg:hidden" aria-label="Open navigation menu">
                  <Menu className="h-5 w-5" aria-hidden />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" aria-describedby={undefined} className="w-72">
                <SheetTitle className="sr-only">Workspace navigation</SheetTitle>
                <div className="space-y-6 pt-2">
                  <div className="flex items-center gap-2.5">
                    <BrandMark className="h-9 w-9" />
                    <div className="leading-tight">
                      <p className="text-sm font-semibold tracking-tight">{user.tenantName ?? "Docurama"}</p>
                      <p className="text-[11px] text-muted-foreground">{user.tenantPlan} plan</p>
                    </div>
                  </div>
                  <nav aria-label="Workspace sections" className="flex flex-col gap-1">{links}</nav>
                </div>
              </SheetContent>
            </Sheet>

            <a href="/" className="flex items-center gap-2.5" aria-label="Docurama home">
              <BrandMark className="h-9 w-9" />
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className="hidden rounded-lg px-2 py-1 text-left leading-tight transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring sm:block"
                    aria-label={`Switch organization - current: ${user.tenantName ?? "Docurama"}`}
                  >
                    <span className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
                      {user.tenantName ?? "Docurama"}
                      <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {user.orgs.length > 1 ? `${user.orgs.length} organizations` : "Docurama Workspace"}
                    </span>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-64">
                  <DropdownMenuLabel className="text-xs text-muted-foreground">Your organizations</DropdownMenuLabel>
                  {user.orgs.map((org) => (
                    <DropdownMenuItem
                      key={org.id}
                      disabled={switching}
                      onClick={() => switchOrg(org.id, org.name)}
                    >
                      <Building2 className="h-4 w-4" aria-hidden />
                      <span className="flex-1 truncate">{org.name}</span>
                      {org.id === user.tenantId && <Check className="h-4 w-4 text-primary" aria-hidden />}
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => onNavigate("settings")}>
                    <Plus className="h-4 w-4" aria-hidden /> New organization
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </a>
          </div>

          <nav aria-label="Workspace sections" className="hidden items-center gap-1 lg:flex">{links}</nav>

          <div className="flex items-center gap-1.5">
            <LanguageSwitcher />
            <Button
              variant="ghost" size="icon" className="h-11 w-11"
              aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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
                    <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <span className="hidden text-left leading-tight sm:block">
                    <span className="block text-sm font-medium">{user.firstName} {user.lastName}</span>
                    <span className="block text-[11px] text-muted-foreground">{user.workspaceRole ?? "Member"}</span>
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
                <DropdownMenuItem onClick={() => { onNavigate("settings"); }}>
                  <Settings className="h-4 w-4" aria-hidden /> Workspace settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={logout} variant="destructive">
                  <LogOut className="h-4 w-4" aria-hidden /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main id="main" className="docurama-scroll mx-auto w-full max-w-7xl flex-1 space-y-6 p-4 sm:p-6">
        {children}
      </main>

      <footer className="border-t bg-background">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© 2026 {BRAND_LEGAL_NAME} - {BRAND_ADDRESS} - documents sealed with PAdES and RFC 3161 timestamps.</p>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>EU data residency</span>
            <span aria-hidden>·</span>
            <span>eIDAS &amp; ESIGN workflows</span>
            <span aria-hidden>·</span>
            <span>verify.docurama.eu</span>
          </p>
        </div>
      </footer>
    </div>
  );
}
