"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { apiPost, ApiError } from "@/lib/client";

/**
 * Shared pieces for the eight production-settings tabs.
 */

/** Mutation helper posting ops to /api/workspace/settings. */
export function useSettingsAct(invalidate: string[] = ["settings"]) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: { op: string; id?: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string; [k: string]: unknown }>("/api/workspace/settings", vars),
    onSuccess: (res) => {
      toast.success(res.message);
      for (const key of invalidate) {
        queryClient.invalidateQueries({ queryKey: ["workspace", key] });
      }
    },
    onError: (err: ApiError) => toast.error(err.message),
  });
}

/** The label + description + switch row used across every settings tab. */
export function ToggleRow({
  checked, onCheckedChange, label, desc, disabled,
}: {
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  label: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <label className="flex min-h-14 items-center justify-between gap-4 rounded-lg border p-3">
      <span className="text-sm">
        {label}
        <span className="block text-xs font-normal text-muted-foreground">{desc}</span>
      </span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} disabled={disabled} />
    </label>
  );
}

export const TIER_BADGE: Record<string, { label: string; className: string }> = {
  free: { label: "FREE TIER", className: "bg-success/15 text-success" },
  trial: { label: "TRIAL CREDIT", className: "bg-info/15 text-info" },
  paid: { label: "PAID", className: "bg-muted text-muted-foreground" },
};

export function deviceFromUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = /Edg\//.test(ua) ? "Edge"
    : /Chrome\//.test(ua) && !/Chromium/.test(ua) ? "Chrome"
    : /Firefox\//.test(ua) ? "Firefox"
    : /Safari\//.test(ua) ? "Safari"
    : /curl/i.test(ua) ? "API client"
    : "Browser";
  const os = /Windows/.test(ua) ? "Windows"
    : /Mac OS X/.test(ua) ? "macOS"
    : /Android/.test(ua) ? "Android"
    : /iPhone|iPad/.test(ua) ? "iOS"
    : /Linux/.test(ua) ? "Linux"
    : "-";
  return `${browser} · ${os}`;
}
