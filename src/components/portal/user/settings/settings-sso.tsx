"use client";

/**
 * Settings → SSO. Workspace owners/admins configure OIDC and SAML
 * connections bound to the company email domain; matching users sign in
 * through the identity provider and are JIT-provisioned into this workspace.
 */

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Building2, Globe2, KeyRound, Loader2, PencilLine, Plus, Power, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ApiError, apiGet, apiJsonPost } from "@/lib/client";
import { ConfirmDialog, ErrorState, StatusBadge } from "@/components/portal/shared";

type Connection = {
  id: string; protocol: "OIDC" | "SAML"; label: string; emailDomain: string;
  issuerUrl: string | null; clientId: string | null;
  idpMetadataConfigured: boolean; clientSecretConfigured: boolean;
  status: string; platformWide: boolean; createdAt: string;
};

type FormState = {
  protocol: "OIDC" | "SAML"; label: string; emailDomain: string;
  issuerUrl: string; clientId: string; clientSecret: string; idpMetadataXml: string;
};

const EMPTY_FORM: FormState = {
  protocol: "OIDC", label: "", emailDomain: "",
  issuerUrl: "", clientId: "", clientSecret: "", idpMetadataXml: "",
};

export function SsoTab() {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<Connection | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data, isError, error, isLoading, refetch } = useQuery({
    queryKey: ["workspace", "sso"],
    queryFn: () => apiGet<{ connections: Connection[] }>("/api/workspace/sso"),
    staleTime: 10_000,
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id?: string; data?: Record<string, unknown> }) =>
      apiJsonPost<{ ok?: boolean; message: string; endpoints?: Record<string, string> }>("/api/workspace/sso", vars),
    onSuccess: (res, vars) => {
      if (vars.op === "test") {
        toast.success(res.message, { description: res.endpoints ? Object.entries(res.endpoints).map(([k, v]) => `${k}: ${v}`).join("\n") : undefined });
      } else {
        toast.success(res.message);
        setShowForm(false);
        setEditing(null);
        setForm(EMPTY_FORM);
        queryClient.invalidateQueries({ queryKey: ["workspace", "sso"] });
      }
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setShowForm(true);
  };

  const openEdit = (c: Connection) => {
    setEditing(c);
    setForm({
      protocol: c.protocol,
      label: c.label,
      emailDomain: c.emailDomain,
      issuerUrl: c.issuerUrl ?? "",
      clientId: c.clientId ?? "",
      clientSecret: "", // never echoed back — blank keeps the stored secret
      idpMetadataXml: "",
    });
    setShowForm(true);
  };

  const save = () => {
    act.mutate({ op: editing ? "update" : "create", id: editing?.id, data: form });
  };

  if (isLoading) {
    return (
      <div className="flex min-h-40 items-center justify-center" role="status" aria-label="Loading SSO">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }
  if (isError || !data) {
    return <ErrorState message={(error as Error)?.message ?? "SSO unavailable"} onRetry={() => refetch()} />;
  }

  const origin = typeof window !== "undefined" ? window.location.origin : "https://app.docurama.eu";

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="flex items-center gap-2 text-sm font-semibold">
                <ShieldCheck className="h-4 w-4 text-primary" aria-hidden />
                Single sign-on for your domain
              </p>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Bind your company email domain to an identity provider. Members sign in with their existing
                corporate credentials; new matching accounts are provisioned automatically on first login.
                Password sign-in keeps working as a fallback for admins.
              </p>
            </div>
            <Button onClick={openCreate}>
              <Plus className="h-4 w-4" aria-hidden /> Add connection
            </Button>
          </div>

          {data.connections.length === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed p-6 text-center">
              <Building2 className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden />
              <p className="mt-3 text-sm font-medium">No SSO connections yet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Add an OIDC (Microsoft Entra ID, Google Workspace, Okta, Keycloak) or SAML connection for your domain.
              </p>
            </div>
          ) : (
            <ul className="mt-6 space-y-3">
              {data.connections.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{c.label}</p>
                      <StatusBadge status={c.protocol} />
                      <StatusBadge status={c.status} />
                      {c.platformWide && <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">platform-wide</span>}
                    </div>
                    <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Globe2 className="h-3.5 w-3.5" aria-hidden />
                      {c.emailDomain}
                      {c.protocol === "OIDC" && (c.issuerUrl ? ` · ${new URL(c.issuerUrl).host}` : " · issuer not set")}
                      {c.protocol === "SAML" && (c.idpMetadataConfigured ? " · IdP metadata on file" : " · metadata missing")}
                      {c.clientSecretConfigured && " · secret stored"}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="outline" size="sm" className="h-11" onClick={() => openEdit(c)} aria-label={`Edit ${c.label}`}>
                      <PencilLine className="h-4 w-4" aria-hidden /> Edit
                    </Button>
                    <Button
                      variant="outline" size="sm" className="h-11"
                      onClick={() => act.mutate({ op: "toggle", id: c.id })}
                      aria-label={`${c.status === "ACTIVE" ? "Disable" : "Enable"} ${c.label}`}
                    >
                      <Power className="h-4 w-4" aria-hidden /> {c.status === "ACTIVE" ? "Disable" : "Enable"}
                    </Button>
                    <ConfirmDialog
                      trigger={
                        <Button variant="ghost" size="sm" className="h-11 text-destructive hover:text-destructive" aria-label={`Delete ${c.label}`}>
                          <Trash2 className="h-4 w-4" aria-hidden />
                        </Button>
                      }
                      title={`Delete ${c.label}?`}
                      description="Users on this domain fall back to password sign-in immediately. SSO-provisioned accounts keep their data."
                      confirmLabel="Delete connection"
                      onConfirm={() => act.mutateAsync({ op: "delete", id: c.id })}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {showForm && (
        <Card>
          <CardContent className="p-6">
            <p className="text-sm font-semibold">{editing ? `Edit ${editing.label}` : "New SSO connection"}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <Label htmlFor="sso-protocol">Protocol</Label>
                <Select
                  value={form.protocol}
                  onValueChange={(v) => setForm({ ...form, protocol: v as "OIDC" | "SAML" })}
                >
                  <SelectTrigger id="sso-protocol" className="mt-1.5">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="OIDC">OIDC (Entra ID, Google, Okta, Keycloak)</SelectItem>
                    <SelectItem value="SAML">SAML 2.0</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="sso-label">Display label</Label>
                <Input
                  id="sso-label" className="mt-1.5" value={form.label} maxLength={60}
                  onChange={(e) => setForm({ ...form, label: e.target.value })}
                  placeholder="Microsoft Entra ID"
                />
              </div>
              <div>
                <Label htmlFor="sso-domain">Email domain</Label>
                <Input
                  id="sso-domain" className="mt-1.5" value={form.emailDomain}
                  onChange={(e) => setForm({ ...form, emailDomain: e.target.value.toLowerCase() })}
                  placeholder="company.com"
                />
                <p className="mt-1 text-xs text-muted-foreground">Every user with this email domain signs in through this connection.</p>
              </div>
              {form.protocol === "OIDC" ? (
                <>
                  <div>
                    <Label htmlFor="sso-issuer">Issuer URL</Label>
                    <Input
                      id="sso-issuer" className="mt-1.5" value={form.issuerUrl}
                      onChange={(e) => setForm({ ...form, issuerUrl: e.target.value })}
                      placeholder="https://login.microsoftonline.com/{tenant}/v2.0"
                    />
                  </div>
                  <div>
                    <Label htmlFor="sso-client-id">Client ID</Label>
                    <Input
                      id="sso-client-id" className="mt-1.5" value={form.clientId}
                      onChange={(e) => setForm({ ...form, clientId: e.target.value })}
                      placeholder="00000000-0000-0000-0000-000000000000"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Label htmlFor="sso-client-secret">Client secret {editing?.clientSecretConfigured && "(blank keeps the stored one)"}</Label>
                    <Input
                      id="sso-client-secret" type="password" className="mt-1.5" value={form.clientSecret}
                      onChange={(e) => setForm({ ...form, clientSecret: e.target.value })}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <Button
                      type="button" variant="outline" size="sm" className="h-11"
                      onClick={() => act.mutate({ op: "test", data: { issuerUrl: form.issuerUrl } })}
                      disabled={act.isPending || !form.issuerUrl}
                    >
                      <KeyRound className="h-4 w-4" aria-hidden /> Test discovery
                    </Button>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Register this redirect URI at your provider: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{origin}/api/auth/sso/callback/oidc</code>
                    </p>
                  </div>
                </>
              ) : (
                <div className="sm:col-span-2">
                  <Label htmlFor="sso-metadata">IdP metadata XML</Label>
                  <Textarea
                    id="sso-metadata" className="mt-1.5 min-h-32 font-mono text-xs" value={form.idpMetadataXml}
                    onChange={(e) => setForm({ ...form, idpMetadataXml: e.target.value })}
                    placeholder="<md:EntityDescriptor …>…</md:EntityDescriptor>"
                  />
                  <p className="mt-1 text-xs text-muted-foreground">
                    Your SP metadata (to register at the IdP):{" "}
                    <a className="underline underline-offset-2" href="/api/auth/sso/metadata/saml" target="_blank" rel="noreferrer">
                      /api/auth/sso/metadata/saml
                    </a>{" "}
                    · ACS: <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[11px]">{origin}/api/auth/sso/callback/saml</code>
                  </p>
                </div>
              )}
            </div>
            <div className="mt-5 flex gap-2">
              <Button onClick={save} disabled={act.isPending}>
                {act.isPending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
                {editing ? "Save changes" : "Create connection"}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); setEditing(null); }}>
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
