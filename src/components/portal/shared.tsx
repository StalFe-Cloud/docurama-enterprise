"use client";

/**
 * Docurama portal shared UI primitives.
 *
 * Every primitive here encodes a fix for a bug found in the original app:
 *  - StatusBadge  → colour-only indicators replaced with colour + text label
 *  - CopyButton   → digests and tokens are always copyable
 *  - EmptyState   → honest empty states (never fake demo data)
 *  - ErrorState   → load failures are visible and retryable (no console-only catches)
 *  - PageHeader   → consistent page anatomy + primary action slot
 *  - DataTable    → pagination, skeleton loading, keyboard-accessible rows, 44px targets
 *  - ConfirmDialog→ replaces window.confirm/alert for destructive flows
 */

import { ReactNode, useState, useEffect } from "react";
import { cn } from "@/lib/utils";

// Convenience re-export - portal views import cn alongside the shared primitives.
export { cn };
import {
  Check, Copy, Inbox, RefreshCw, TriangleAlert, ChevronLeft, ChevronRight, Search,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// ── Status vocabulary (colour AND text - WCAG 1.4.1) ───────────────────────

const STATUS_STYLES: Record<string, string> = {
  // envelope
  DRAFT: "bg-muted text-muted-foreground",
  SENT: "bg-info-soft text-info",
  PARTIALLY_SIGNED: "bg-warning-soft text-warning",
  COMPLETED: "bg-success-soft text-success",
  SEALED: "bg-success-soft text-success",
  VERIFIED: "bg-success-soft text-success",
  VOIDED: "bg-destructive/10 text-destructive",
  DECLINED: "bg-destructive/10 text-destructive",
  EXPIRED: "bg-muted text-muted-foreground",
  NOT_SEALED: "bg-warning-soft text-warning",
  NOT_FOUND: "bg-muted text-muted-foreground",
  // tenant / user / sub
  ACTIVE: "bg-success-soft text-success",
  TRIAL: "bg-primary-soft text-primary",
  TRIALING: "bg-primary-soft text-primary",
  SUSPENDED: "bg-destructive/10 text-destructive",
  PAST_DUE: "bg-destructive/10 text-destructive",
  CANCELED: "bg-muted text-muted-foreground",
  INVITED: "bg-info-soft text-info",
  // domain
  PENDING: "bg-warning-soft text-warning",
  FAILED: "bg-destructive/10 text-destructive",
  JOIN_REQUESTED: "bg-primary-soft text-primary",
  OPEN: "bg-info-soft text-info",
  RUNNING: "bg-info-soft text-info",
  RESOLVED: "bg-success-soft text-success",
  CONTAINED: "bg-warning-soft text-warning",
  // compliance
  IMPLEMENTED: "bg-success-soft text-success",
  PARTIAL: "bg-warning-soft text-warning",
  PLANNED: "bg-muted text-muted-foreground",
  GRANTED: "bg-success-soft text-success",
  WITHDRAWN: "bg-muted text-muted-foreground",
  RELEASED: "bg-muted text-muted-foreground",
  MITIGATED: "bg-success-soft text-success",
  ACCEPTED: "bg-muted text-muted-foreground",
  APPROVED: "bg-success-soft text-success",
  REJECTED: "bg-destructive/10 text-destructive",
  IMPLEMENTING: "bg-info-soft text-info",
  PASS: "bg-success-soft text-success",
  // plans / severity / health
  STARTER: "bg-muted text-muted-foreground",
  BUSINESS: "bg-primary-soft text-primary",
  ENTERPRISE: "bg-nautical text-white dark:bg-primary-soft dark:text-primary",
  SEV1: "bg-destructive/10 text-destructive",
  SEV2: "bg-warning-soft text-warning",
  SEV3: "bg-info-soft text-info",
  HEALTHY: "bg-success-soft text-success",
  DEGRADED: "bg-warning-soft text-warning",
  OUTAGE: "bg-destructive/10 text-destructive",
  FAILING: "bg-destructive/10 text-destructive",
  PAUSED: "bg-muted text-muted-foreground",
  NORMAL: "bg-muted text-muted-foreground",
  HIGH: "bg-warning-soft text-warning",
  INFO: "bg-info-soft text-info",
  WARNING: "bg-warning-soft text-warning",
  CRITICAL: "bg-destructive/10 text-destructive",
  LOW: "bg-muted text-muted-foreground",
  MEDIUM: "bg-warning-soft text-warning",
};

const STATUS_LABELS: Record<string, string> = {
  PARTIALLY_SIGNED: "Partially signed",
  NOT_SEALED: "Not sealed",
  NOT_FOUND: "Not found",
  JOIN_REQUESTED: "Join requested",
  PAST_DUE: "Past due",
  TRIALING: "Trialing",
  PENDING: "Pending",
  SEALED: "Sealed",
  ACTIVE: "Active",
  TRIAL: "Trial",
  VOIDED: "Voided",
  DECLINED: "Declined",
  EXPIRED: "Expired",
  DRAFT: "Draft",
  SENT: "Sent",
  COMPLETED: "Completed",
  SUSPENDED: "Suspended",
  INVITED: "Invited",
  VERIFIED: "Verified",
  FAILED: "Failed",
  OPEN: "Open",
  RUNNING: "Running",
  RESOLVED: "Resolved",
  CONTAINED: "Contained",
  IMPLEMENTED: "Implemented",
  PARTIAL: "Partial",
  PLANNED: "Planned",
  GRANTED: "Granted",
  WITHDRAWN: "Withdrawn",
  RELEASED: "Released",
  MITIGATED: "Mitigated",
  ACCEPTED: "Accepted",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PASS: "Pass",
  STARTER: "Starter",
  BUSINESS: "Business",
  ENTERPRISE: "Enterprise",
  SEV1: "SEV1",
  SEV2: "SEV2",
  SEV3: "SEV3",
  HEALTHY: "Healthy",
  DEGRADED: "Degraded",
  OUTAGE: "Outage",
  FAILING: "Failing",
  PAUSED: "Paused",
  NORMAL: "Normal",
  HIGH: "High",
  INFO: "Info",
  WARNING: "Warning",
  CRITICAL: "Critical",
  LOW: "Low",
  MEDIUM: "Medium",
  READONLY: "Read-only",
  ENVELOPES: "Envelopes",
  TEMPLATES: "Templates",
  FULL: "Full access",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const style = STATUS_STYLES[status] ?? "bg-muted text-muted-foreground";
  const label = STATUS_LABELS[status] ?? status.replace(/_/g, " ").toLowerCase();
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium whitespace-nowrap",
        style, className,
      )}
    >
      {label}
    </span>
  );
}

// ── Copy affordance (digests, codes, tokens - never truncate-only) ─────────

export function CopyButton({ value, label = "Copy", className }: { value: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 2000);
    return () => clearTimeout(t);
  }, [copied]);
  return (
    <button
      type="button"
      aria-label={`${label}: ${value.slice(0, 24)}…`}
      title={label}
      onClick={(e) => {
        e.stopPropagation();
        navigator.clipboard?.writeText(value).then(() => setCopied(true));
      }}
      className={cn(
        "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors",
        "hover:bg-accent hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring",
        className,
      )}
    >
      {copied ? <Check className="h-3.5 w-3.5 text-success" aria-hidden /> : <Copy className="h-3.5 w-3.5" aria-hidden />}
      <span aria-live="polite" className="sr-only">{copied ? "Copied" : label}</span>
    </button>
  );
}

/** Monospace value with copy - for digests / codes / fingerprints. */
export function CopyableCode({ value, max = 20, className }: { value: string; max?: number; className?: string }) {
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1", className)}>
      <code className="truncate font-mono text-xs text-muted-foreground" title={value}>
        {value.length > max ? `${value.slice(0, max)}…${value.slice(-6)}` : value}
      </code>
      <CopyButton value={value} />
    </span>
  );
}

// ── Honest empty / error states ─────────────────────────────────────────────

export function EmptyState({
  icon: Icon = Inbox, title, description, action,
}: { icon?: React.ComponentType<{ className?: string }>; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">{title}</p>
        {description && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center justify-center gap-3 px-6 py-14 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10">
        <TriangleAlert className="h-6 w-6 text-destructive" aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-semibold">Something went wrong</p>
        <p className="mx-auto max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="h-4 w-4" aria-hidden /> Try again
        </Button>
      )}
    </div>
  );
}

// ── Page anatomy ────────────────────────────────────────────────────────────

export function PageHeader({
  title, description, actions,
}: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

// ── Skeletons ───────────────────────────────────────────────────────────────

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-2 p-4" aria-hidden>
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-9 flex-1", c === 0 && "max-w-[220px]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ cards = 4 }: { cards?: number }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-hidden>
      {Array.from({ length: cards }).map((_, i) => (
        <div key={i} className="rounded-xl border bg-card p-5 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-8 w-20" />
          <Skeleton className="h-3 w-32" />
        </div>
      ))}
    </div>
  );
}

// ── DataTable with pagination + search + keyboard support ───────────────────

export type Column<T> = {
  key: string;
  header: ReactNode;
  className?: string;
  render: (row: T) => ReactNode;
};

export function DataTable<T extends { id: string }>({
  columns, rows, total, page, perPage, loading, error,
  onPageChange, onSearch, searchPlaceholder = "Search…", onRetry,
  onRowClick, emptyTitle = "Nothing here yet", emptyDescription,
  emptyAction, ariaLabel,
}: {
  columns: Column<T>[];
  rows: T[];
  total?: number;
  page?: number;
  perPage?: number;
  loading?: boolean;
  error?: string | null;
  onPageChange?: (p: number) => void;
  onSearch?: (q: string) => void;
  searchPlaceholder?: string;
  onRetry?: () => void;
  onRowClick?: (row: T) => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  ariaLabel?: string;
}) {
  const [search, setSearch] = useState("");
  const pages = total !== undefined && perPage ? Math.max(1, Math.ceil(total / perPage)) : 1;
  const current = page ?? 1;

  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {onSearch && (
        <div className="flex items-center gap-2 border-b px-4 py-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); onSearch(e.target.value); }}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            className="h-9 border-0 shadow-none focus-visible:ring-0 placeholder:text-muted-foreground"
          />
        </div>
      )}
      {loading ? (
        <TableSkeleton cols={columns.length} />
      ) : error ? (
        <ErrorState message={error} onRetry={onRetry} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="docurama-scroll overflow-x-auto">
          <table className="w-full text-sm" aria-label={ariaLabel}>
            <thead>
              <tr className="border-b bg-muted/50 text-left">
                {columns.map((c) => (
                  <th key={c.key} scope="col" className={cn("whitespace-nowrap px-4 py-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground", c.className)}>
                    {c.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={row.id}
                  tabIndex={onRowClick ? 0 : -1}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  onKeyDown={onRowClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onRowClick(row); } } : undefined}
                  className={cn(
                    "border-b transition-colors last:border-0",
                    onRowClick && "cursor-pointer hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:outline-2 -outline-offset-2 outline-primary",
                  )}
                >
                  {columns.map((c) => (
                    <td key={c.key} className={cn("px-4 py-3 align-middle", c.className)}>
                      {c.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {pages > 1 && !loading && !error && (
        <nav className="flex items-center justify-between border-t px-4 py-3" aria-label="Table pagination">
          <p className="text-xs text-muted-foreground">
            Page <span className="font-medium text-foreground">{current}</span> of {pages}
            {total !== undefined && <> · {total} total</>}
          </p>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={current <= 1} onClick={() => onPageChange?.(current - 1)} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" aria-hidden />
            </Button>
            <Button variant="outline" size="sm" disabled={current >= pages} onClick={() => onPageChange?.(current + 1)} aria-label="Next page">
              <ChevronRight className="h-4 w-4" aria-hidden />
            </Button>
          </div>
        </nav>
      )}
    </div>
  );
}

// ── Destructive confirmation (replaces window.confirm) ─────────────────────

export function ConfirmDialog({
  trigger, title, description, confirmLabel = "Confirm", destructive = true,
  onConfirm, requireReason = false, reasonLabel = "Reason",
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel?: string;
  destructive?: boolean;
  // Callers commonly pass `() => mutation.mutateAsync(...)` which resolves to
  // the mutation payload - accept any resolved value, only void/awaited usage matters.
  onConfirm: (reason: string) => unknown | Promise<unknown>;
  requireReason?: boolean;
  reasonLabel?: string;
}) {
  const [reason, setReason] = useState("");
  const [open, setOpen] = useState(false);
  const disabled = requireReason && !reason.trim();

  return (
    <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setReason(""); }}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {requireReason && (
          <div className="space-y-1.5 py-1">
            <label htmlFor="confirm-reason" className="text-sm font-medium">
              {reasonLabel} <span className="text-destructive" aria-hidden>*</span>
            </label>
            <Input
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={`Provide a ${reasonLabel.toLowerCase()} - this is recorded in the audit trail`}
              aria-required="true"
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled}
            onClick={(e) => {
              e.preventDefault();
              Promise.resolve(onConfirm(reason.trim())).then(() => setOpen(false));
            }}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Small utilities ────────────────────────────────────────────────────────

export function fmtDate(value: string | null | undefined, withTime = false) {
  if (!value) return "-";
  const d = new Date(value);
  const locale = typeof document !== "undefined" && document.documentElement.lang?.startsWith("fr") ? "fr-FR" : "en-GB";
  return d.toLocaleDateString(locale, {
    day: "numeric", month: "short", year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  });
}

export function fmtRelative(value: string | null | undefined) {
  if (!value) return "-";
  const diff = Date.now() - new Date(value).getTime();
  const mins = Math.floor(diff / 60000);
  const isFr = typeof document !== "undefined" && document.documentElement.lang?.startsWith("fr");
  if (mins < 1) return isFr ? "à l'instant" : "just now";
  if (mins < 60) return isFr ? `il y a ${mins} min` : `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return isFr ? `il y a ${hours} h` : `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return isFr ? `il y a ${days} j` : `${days}d ago`;
  return fmtDate(value);
}

export function fmtMb(mb: number) {
  return mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`;
}

/** Days until a future date (negative when past). */
export function daysUntil(value: string | Date) {
  return Math.ceil((new Date(value).getTime() - Date.now()) / 86400000);
}

export function KpiCard({
  label, value, sub, icon: Icon, tone = "default",
}: {
  label: string; value: ReactNode; sub?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
  tone?: "default" | "success" | "warning" | "destructive" | "primary";
}) {
  const tones = {
    default: "text-foreground",
    success: "text-success",
    warning: "text-warning",
    destructive: "text-destructive",
    primary: "text-primary",
  };
  return (
    <div className="rounded-xl border bg-card p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" aria-hidden />}
      </div>
      <p className={cn("mt-2 text-2xl font-semibold tabular-nums", tones[tone])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
