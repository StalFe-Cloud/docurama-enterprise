"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Users, Plus, Trash2, ShieldCheck, Mail, UsersRound } from "lucide-react";
import { apiGet } from "@/lib/client";
import { ConfirmDialog, ErrorState, StatusBadge, fmtDate, cn } from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSettingsAct, ToggleRow } from "./settings-shared";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type UsersData = {
  members: { id: string; role: string; name: string; email: string; status: string; totpEnabled: boolean; lastActiveAt: string | null; teamId: string | null; teamName: string | null }[];
  invitations: { id: string; email: string; role: string; invitedBy: string; createdAt: string; expiresAt: string }[];
  seats: { used: number; limit: number; remaining: number; members: number; pendingInvites: number; planName: string };
  teams: { id: string; name: string; memberCount: number }[];
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
      <TeamsCard data={base.data} />
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
          Tokenized links emailed from notifications@docurama.eu - invitees create their own password at /invite/&lt;token&gt;, so this workspace never handles credentials on their behalf. Each pending invitation holds one seat until accepted or revoked.
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
                description="The invitation link stops working immediately and frees the seat it was holding. You can send a fresh invitation at any time."
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
  const [teamDraft, setTeamDraft] = useState<Record<string, string>>({});

  const seats = data.seats ?? { used: data.members.length, limit: data.plan?.seatLimit ?? 10, remaining: 0, members: data.members.length, pendingInvites: 0, planName: "" };
  const full = seats.remaining <= 0;
  const pct = seats.limit > 0 ? Math.min(100, Math.round((seats.used / seats.limit) * 100)) : 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-muted-foreground" aria-hidden /> Users &amp; roles
        </CardTitle>
        <CardDescription>
          {seats.members} of {seats.limit} seats occupied on the {seats.planName || "current"} plan
          {seats.pendingInvites > 0 && <> · {seats.pendingInvites} pending invitation{seats.pendingInvites === 1 ? "" : "s"} holding a seat</>}.
          Roles: Owner (billing + everything), Workspace admin (manage members &amp; settings), Member (prepare and send documents).
        </CardDescription>
        <div className="mt-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Seat usage</span>
            <span className={cn("tabular-nums font-medium", full ? "text-destructive" : "text-muted-foreground")}>
              {seats.used}/{seats.limit} used · {seats.remaining} remaining
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={seats.used} aria-valuemin={0} aria-valuemax={seats.limit} aria-label={`${seats.used} of ${seats.limit} seats used`}>
            <div className={cn("h-full rounded-full transition-all", full ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
          </div>
          {!full ? (
            <p className="text-xs text-muted-foreground">
              {seats.remaining === 1
                ? "One seat left — invite the teammate who sends the most documents."
                : `${seats.remaining} seats still open. Invite your team so contracts don't queue on one account.`}
            </p>
          ) : (
            <p className="text-xs text-destructive">
              All seats are in use. Revoke an unused invitation or upgrade the plan to invite more teammates.
            </p>
          )}
        </div>
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
            disabled={!invite.email.includes("@") || act.isPending || !data.isAdmin || full}
            title={full ? "All seats are in use" : undefined}
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
                <th scope="col" className="p-3 font-medium">Team</th>
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
                  <td className="p-3">
                    <Select
                      value={teamDraft[m.id] ?? m.teamId ?? "none"}
                      onValueChange={(v) => setTeamDraft({ ...teamDraft, [m.id]: v })}
                      disabled={!data.isAdmin || act.isPending || data.teams.length === 0}
                    >
                      <SelectTrigger className="h-9 w-40 text-xs" aria-label={`Team for ${m.name}`}><SelectValue placeholder="No team" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No team</SelectItem>
                        {data.teams.map((t) => (
                          <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </td>
                  <td className="p-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {m.role !== "OWNER" && roleDraft[m.id] && roleDraft[m.id] !== m.role && (
                        <Button
                          size="sm" className="h-9"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ op: "member.role", id: m.id, data: { role: roleDraft[m.id] } })}
                        >
                          Apply role
                        </Button>
                      )}
                      {m.role !== "OWNER" && teamDraft[m.id] !== undefined && teamDraft[m.id] !== (m.teamId ?? "none") && (
                        <Button
                          size="sm" variant="outline" className="h-9"
                          disabled={act.isPending}
                          onClick={() => act.mutate({ op: "member.team", id: m.id, data: { teamId: teamDraft[m.id] === "none" ? null : teamDraft[m.id] } })}
                        >
                          Apply team
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

function TeamsCard({ data }: { data: UsersData }) {
  const act = useSettingsAct(["settings"]);
  const [name, setName] = useState("");

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <UsersRound className="h-4 w-4 text-muted-foreground" aria-hidden /> Small team groups
        </CardTitle>
        <CardDescription>
          Organize members into small groups within the company — Sales, HR, Legal — so large workspaces stay navigable. Teams are purely organizational: every member keeps full workspace visibility.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1.5">
            <Label htmlFor="team-name">New team</Label>
            <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Legal" className="h-11" maxLength={40} />
          </div>
          <Button
            className="h-11"
            disabled={!name.trim() || act.isPending || !data.isAdmin}
            onClick={() => { act.mutate({ op: "team.create", data: { name: name.trim() } }); setName(""); }}
          >
            <Plus className="h-4 w-4" aria-hidden /> Create team
          </Button>
        </div>
        {data.teams.length > 0 ? (
          <ul className="divide-y rounded-lg border">
            {data.teams.map((t) => (
              <li key={t.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.memberCount} member{t.memberCount === 1 ? "" : "s"}
                  </p>
                </div>
                <ConfirmDialog
                  trigger={
                    <Button variant="ghost" size="sm" className="text-destructive" disabled={act.isPending}>
                      Delete
                    </Button>
                  }
                  title={`Delete team "${t.name}"?`}
                  description="Members of this team are unassigned (they keep full workspace access)."
                  confirmLabel="Delete team"
                  onConfirm={() => act.mutateAsync({ op: "team.delete", id: t.id })}
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-muted-foreground">
            No teams yet. Create one above, then assign members from the Team column in Users &amp; roles.
          </p>
        )}
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
