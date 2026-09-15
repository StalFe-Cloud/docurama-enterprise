"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Ban, ShieldCheck, UserCheck } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { Column, ConfirmDialog, DataTable, PageHeader, StatusBadge, fmtRelative } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";

type UserRow = {
  id: string; email: string; name: string; role: string; status: string;
  totpEnabled: boolean; lastActiveAt: string | null; createdAt: string;
  tenantName: string | null; tenantPlan: string | null; workspaceRole: string | null;
};

export function AdminUsers() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "users", page, search],
    queryFn: () => apiGet<{ rows: UserRow[]; total: number; perPage: number }>(`/api/admin/users?page=${page}&perPage=10&q=${encodeURIComponent(search)}`),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id: string }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/users", vars),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const columns: Column<UserRow>[] = [
    {
      key: "name", header: "User",
      render: (u) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{u.name}</p>
          <p className="truncate text-xs text-muted-foreground">{u.email}</p>
        </div>
      ),
    },
    {
      key: "role", header: "Role",
      render: (u) => (
        <span className="text-sm capitalize">
          {u.role === "PLATFORM_ADMIN" ? "Platform admin" : u.workspaceRole ? `${u.workspaceRole.toLowerCase()} · workspace` : "Member"}
        </span>
      ),
    },
    {
      key: "tenant", header: "Tenant",
      render: (u) => u.tenantName ? (
        <div className="min-w-0">
          <p className="truncate text-sm">{u.tenantName}</p>
          {u.tenantPlan && <StatusBadge status={u.tenantPlan} className="mt-0.5" />}
        </div>
      ) : <span className="text-sm text-muted-foreground">Docurama SAS</span>,
    },
    {
      key: "2fa", header: "2FA",
      render: (u) => u.totpEnabled
        ? <span className="inline-flex items-center gap-1 text-sm text-success"><ShieldCheck className="h-4 w-4" aria-hidden /> Enabled</span>
        : <span className="text-sm text-muted-foreground">Not set</span>,
    },
    { key: "status", header: "Status", render: (u) => <StatusBadge status={u.status} /> },
    { key: "active", header: "Last active", render: (u) => <span className="text-sm text-muted-foreground">{fmtRelative(u.lastActiveAt)}</span> },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, className: "w-28",
      render: (u) => (
        <div className="flex justify-end gap-1">
          {!u.totpEnabled && u.role !== "PLATFORM_ADMIN" && (
            <Button
              variant="ghost" size="icon" className="h-11 w-11" aria-label={`Enforce two-factor for ${u.name}`}
              title="Enforce two-factor authentication"
              onClick={() => act.mutate({ op: "force-2fa", id: u.id })}
            >
              <ShieldCheck className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {u.role !== "PLATFORM_ADMIN" && (
            u.status === "ACTIVE" ? (
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="icon" className="h-11 w-11 text-destructive" aria-label={`Deactivate ${u.name}`} title="Deactivate">
                    <Ban className="h-4 w-4" aria-hidden />
                  </Button>
                }
                title={`Deactivate ${u.name}?`}
                description="The user is signed out everywhere and cannot sign in until reactivated. Their documents and memberships are preserved."
                confirmLabel="Deactivate user"
                onConfirm={() => act.mutateAsync({ op: "toggle-status", id: u.id })}
              />
            ) : (
              <Button
                variant="ghost" size="icon" className="h-11 w-11 text-success" aria-label={`Reactivate ${u.name}`} title="Reactivate"
                onClick={() => act.mutate({ op: "toggle-status", id: u.id })}
              >
                <UserCheck className="h-4 w-4" aria-hidden />
              </Button>
            )
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users"
        description="Platform-wide directory. Enforce 2FA, deactivate accounts and audit activity - every action lands in the audit chain."
      />
      <DataTable<UserRow>
        ariaLabel="User directory"
        columns={columns}
        rows={data?.rows ?? []}
        total={data?.total}
        page={page}
        perPage={data?.perPage ?? 10}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onPageChange={setPage}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search by name, email or tenant…"
        onRetry={() => refetch()}
        emptyTitle="No users match your search"
        emptyDescription="Try a different name, email or tenant."
      />
    </div>
  );
}
