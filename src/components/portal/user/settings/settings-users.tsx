"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Plus, Trash2, ShieldCheck, Mail } from "lucide-react";
import { apiGet } from "@/lib/client";
import { ConfirmDialog, ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsAct, ToggleRow } from "./settings-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type UsersData = {
  members: { id: string; role: string; name: string; email: string; status: string; totpEnabled: boolean; lastActiveAt: string | null }[];
  invitations: { id: string; email: string; role: string; invitedBy: string; createdAt: string; expiresAt: string }[];
  plan: { seatLimit: number } | null;
  isAdmin: boolean;
};

type AccountInfo = { enforceTwoFactor: boolean };

export function UsersTab() {
  const base = useQuery({
    queryKey: ["workspace", "settings"],
    queryFn: () => apiGet<UsersData>("/api/workspace/settings"),
  });
  const account = useQuery({
    queryKey: ["workspace", "settings-account"],
    queryFn: () => apiGet<AccountInfo>("/api/workspace/settings-account"),
  });

  if (base.error) return <ErrorState message={(base.error as Error).message} onRetry={() => base.refetch()} />;
  if (base.isLoading || !base.data) {
    return <div className="h-96 animate-pulse rounded-xl bg-muted" aria-busy />;
  }

  return (
    <div className="space-y-6">
      <TeamCard data={base.data} />
      {base.data.invitations?.length > 0 && <PendingInvitesCard data={base.data} />}
      <EnforcementCard enforce={account.data?.enforceTwoFactor ?? false} isAdmin={base.data.isAdmin} />
    </div>
  );
}

function PendingInvitesCard({ data }: { data: UsersData }) {
  const act = useSettingsAct(["settings"]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Mail className="h-4 w-4 text-muted-foreground" aria-hidden /> Pending invitations
        </CardTitle>
        <CardDescription>
          Tokenized links emailed from notifications@docurama.eu - invitees create their own password at /invite/&lt;token&gt;, so this workspace never handles credentials on their behalf. Re-send by inviting the same address again.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y rounded-lg border">
          {data.invitations.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
              <div className="min-w-0">
                <p className="truncate font-medium">{inv.email}</p>
                <p className="text-xs text-muted-foreground">
                  {inv.role === "ADMIN" ? "Workspace admin" : "Member"} · invited by {inv.invitedBy} · {fmtDate(inv.createdAt)}
                </p>
              </div>
              <ConfirmDialog
                trigger={
                  <Button variant="ghost" size="sm" className="text-destructive" disabled={act.isPending}>
                    Revoke
                  </Button>
                }
                title={`Revoke invitation for ${inv.email}?`}
                description="The invitation link stops working immediately. You can send a fresh invitation at any time."
                confirmLabel="Revoke invitation"
                onConfirm={() => act.mutateAsync({ op: "invite-revoke", id: inv.id })}
              />
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function TeamCard({ data }: { data: UsersData }) {
  const act = useSettingsAct(["settings"]);
  const [invite, setInvite] = useState({ email: "", role: "MEMBER" });
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden /> Users &amp; roles
        </CardTitle>
        <CardDescription>
          {data.members.length} of {data.plan?.seatLimit ?? 10} seats used. Roles: Owner (billing + everything), Workspace admin (manage members &amp; settings), Member (prepare and send documents).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="invite-email">Invite by email</Label>
            <Input id="invite-email" type="email" value={invite.email} onChange={(e) => setInvite({ ...invite, email: e.target.value })} placeholder="colleague@company.com" className="h-11" />
          </div>
          <div className="w-full space-y-1.5 sm:w-48">
            <Label htmlFor="invite-role">Role</Label>
            <Select value={invite.role} onValueChange={(v) => setInvite({ ...invite, role: v })} disabled={!data.isAdmin}>
              <SelectTrigger id="invite-role" className="h-11"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="MEMBER">Member</SelectItem>
                <SelectItem value="ADMIN">Workspace admin</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Button
            className="h-11"
            disabled={!invite.email.includes("@") || act.isPending || !data.isAdmin}
            onClick={() => { act.mutate({ op: "invite-member", data: invite }); setInvite({ email: "", role: "MEMBER" }); }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Invite
          </Button>
        </div>

        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <caption className="sr-only">Workspace members</caption>
            <thead>
              <tr className="border-b bg-muted/50 text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th scope="col" className="p-3 font-medium">Member</th>
                <th scope="col" className="p-3 font-medium">Status</th>
                <th scope="col" className="p-3 font-medium">2FA</th>
                <th scope="col" className="p-3 font-medium">Last active</th>
                <th scope="col" className="p-3 font-medium">Role</th>
                <th scope="col" className="p-3 font-medium sr-only">Actions</th>
              </tr>
            </thead>
            <tbody>
              {data.members.map((m) => (
                <tr key={m.id} className="border-b last:border-0">
                  <td className="p-3">
                    <p className="font-medium">{m.name}</p>
                    <p className="text-xs text-muted-foreground">{m.email}</p>
                  </td>
                  <td className="p-3"><StatusBadge status={m.status} /></td>
                  <td className="p-3">
                    <span className={cn("text-xs font-medium", m.totpEnabled ? "text-success" : "text-muted-foreground")}>
                      {m.totpEnabled ? "Enabled" : "-"}
                    </span>
                  </td>
                  <td className="p-3 text-xs text-muted-foreground">{m.lastActiveAt ? fmtDate(m.lastActiveAt) : "never"}</td>
                  <td className="p-3">
                    {m.role === "OWNER" ? (
                      <span className="text-xs font-medium capitalize">Owner</span>
                    ) : (
                      <Select
                        value={roleDraft[m.id] ?? m.role}
                        onValueChange={(v) => setRoleDraft({ ...roleDraft, [m.id]: v })}
                        disabled={!data.isAdmin || act.isPending}
                      >
                        <SelectTrigger className="h-9 w-40 text-xs" aria-label={`Role for ${m.name}`}><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="MEMBER">Member</SelectItem>
                          <SelectItem value="ADMIN">Workspace admin</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {m.role !== "OWNER" && roleDraft[m.id] && roleDraft[m.id] !== m.role && (
                        <Button
                          size="sm" className="h-9"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ op: "member.role", id: m.id, data: { role: roleDraft[m.id] } })}
                        >
                          Apply
                        </Button>
                      )}
                      {m.role !== "OWNER" && (
                        <ConfirmDialog
                          trigger={
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive" aria-label={`Remove ${m.name}`} title="Remove member">
                              <Trash2 className="h-4 w-4" aria-hidden />
                            </Button>
                          }
                          title={`Remove ${m.name}?`}
                          description="They immediately lose access to this workspace. Their past documents remain in the audit trail."
                          confirmLabel="Remove member"
                          onConfirm={() => act.mutateAsync({ op: "remove-member", id: m.id })}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function EnforcementCard({ enforce, isAdmin }: { enforce: boolean; isAdmin: boolean }) {
  const act = useSettingsAct(["settings", "settings-account"]);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldCheck className="h-4 w-4 text-muted-foreground" aria-hidden /> Two-factor policy
        </CardTitle>
        <CardDescription>
          Workspace-wide enforcement (SOC 2 CC6.1 / ISO 27001 access control). Members without 2FA are prompted to enrol at their next sign-in.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ToggleRow
          checked={enforce}
          disabled={!isAdmin || act.isPending}
          onCheckedChange={(v) => act.mutate({ op: "enforce-2fa", data: { enabled: v } })}
          label="Require two-factor authentication for all members"
          desc={isAdmin ? "Applies to every member of this workspace" : "Only workspace owners and admins can change this policy"}
        />
      </CardContent>
    </Card>
  );
}
