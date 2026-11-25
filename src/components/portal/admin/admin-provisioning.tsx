"use client";

/**
 * Admin - Email & DNS provisioning for docurama.eu.
 *
 * One console for the VOIRIA SASU (Docurama) digital identity:
 *  - Company identity card (legal entity, Paris address, fill-in registry data).
 *  - The 12 role-based mailboxes/aliases (transactional, business, legal/privacy,
 *    RFC 5321/2142) with provision / round-trip test actions.
 *  - Every sub-domain on the zone with its purpose, record and TLS posture.
 *  - The deliverability record set (MX, SPF, DKIM, DMARC, MTA-STS, TLS-RPT, CAA)
 *    with per-record verification.
 *  - The generated BIND zone file - copy or download, ready for the registrar.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Mail, Globe2, ShieldCheck, FileCode2, RefreshCw, Send, CheckCircle2,
  Building2, MapPin, Hash, Landmark, Phone, Download, ArrowRight,
} from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import {
  CopyButton, CopyableCode, ErrorState, KpiCard, PageHeader, StatusBadge,
} from "@/components/portal/shared";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type EmailRow = {
  address: string; displayName: string;
  kind: "MAILBOX_SMTP" | "MAILBOX" | "SHARED_INBOX" | "ALIAS" | "REPORTS";
  category: string; purpose: string;
  forwardsTo?: string; rfc?: string; notes?: string;
  priority: "P0" | "P1" | "P2";
  provisioned: boolean;
};

type SubdomainRow = {
  host: string; fqdn: string; purpose: string;
  recordType: "A" | "AAAA" | "CNAME"; target: string;
  audience: string; env: string; tls: string;
  live: boolean;
};

type DnsRow = {
  id: string; group: string; name: string;
  type: string; value: string; priority?: number; ttl: number;
  purpose: string; rfc?: string; verified: boolean;
};

type ProvisioningData = {
  company: {
    legalName: string; address: string; country: string;
    registrationNumber: string; vatNumber: string; shareCapital: string;
    dpoEmail: string; legalEmail: string; securityEmail: string;
    adminEmail: string; phone: string; dataResidency: string;
  };
  emails: EmailRow[];
  subdomains: SubdomainRow[];
  dnsRecords: DnsRow[];
  zoneFile: string;
  summary: {
    emailsProvisioned: number; emailsTotal: number;
    subdomainsLive: number; subdomainsTotal: number;
    recordsVerified: number; recordsTotal: number;
  };
};

const KIND_LABEL: Record<EmailRow["kind"], string> = {
  MAILBOX_SMTP: "Real mailbox · SMTP credentials",
  MAILBOX: "Real mailbox",
  SHARED_INBOX: "Shared inbox",
  ALIAS: "Alias / forwarder",
  REPORTS: "Report destination",
};

const PRIORITY_STYLE: Record<EmailRow["priority"], string> = {
  P0: "bg-destructive/10 text-destructive",
  P1: "bg-warning-soft text-warning",
  P2: "bg-muted text-muted-foreground",
};

/** Structural type for the provisioning action mutation shared by all tabs. */
type ActMutation = {
  isPending: boolean;
  mutate: (vars: { op: string; id?: string }) => void;
};

export function AdminProvisioning() {
  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["admin", "provisioning"],
    queryFn: () => apiGet<ProvisioningData>("/api/admin/provisioning"),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id?: string }) =>
      apiPost<{ ok: boolean; message: string }>("/api/admin/provisioning", vars),
    onSuccess: (res) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["admin", "provisioning"] });
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  if (error) {
    return (
      <div className="space-y-6">
        <PageHeader title="Email & DNS" description="Domain provisioning for docurama.eu." />
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      </div>
    );
  }

  const s = data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Email & DNS"
        description="VOIRIA SASU digital identity on docurama.eu (Docurama is a product of VOIRIA) - mailboxes, sub-domains, DNS deliverability records (SPF, DKIM, DMARC, MTA-STS) and the exportable zone file."
        actions={
          <Button
            variant="outline" size="sm" className="h-11"
            onClick={() => refetch()} disabled={isLoading}
          >
            <RefreshCw className={cn("h-4 w-4", isLoading && "animate-spin")} aria-hidden /> Refresh
          </Button>
        }
      />

      {/* Provisioning KPIs */}
      <div className="grid gap-4 sm:grid-cols-3">
        <KpiCard
          label="Mailboxes provisioned"
          value={isLoading ? "…" : `${s?.emailsProvisioned ?? 0} / ${s?.emailsTotal ?? 0}`}
          sub="P0 addresses are live for signing, admin and RFC compliance"
          icon={Mail}
        />
        <KpiCard
          label="Sub-domains live"
          value={isLoading ? "…" : `${s?.subdomainsLive ?? 0} / ${s?.subdomainsTotal ?? 0}`}
          sub="app · verify · api · mail · mta-sts · status · docs · staging"
          icon={Globe2}
        />
        <KpiCard
          label="DNS records verified"
          value={isLoading ? "…" : `${s?.recordsVerified ?? 0} / ${s?.recordsTotal ?? 0}`}
          sub="MX · SPF · DKIM · DMARC · MTA-STS · TLS-RPT · CAA · PTR"
          icon={ShieldCheck}
        />
      </div>

      <Tabs defaultValue="mailboxes">
        <TabsList className="h-12">
          <TabsTrigger value="mailboxes" className="gap-2 px-4">
            <Mail className="h-4 w-4" aria-hidden /> Mailboxes & aliases
          </TabsTrigger>
          <TabsTrigger value="subdomains" className="gap-2 px-4">
            <Globe2 className="h-4 w-4" aria-hidden /> Sub-domains
          </TabsTrigger>
          <TabsTrigger value="dns" className="gap-2 px-4">
            <ShieldCheck className="h-4 w-4" aria-hidden /> DNS & deliverability
          </TabsTrigger>
          <TabsTrigger value="zone" className="gap-2 px-4">
            <FileCode2 className="h-4 w-4" aria-hidden /> Zone file & identity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="mailboxes" className="mt-4">
          <MailboxesTab emails={data?.emails ?? []} act={act} loading={isLoading} />
        </TabsContent>
        <TabsContent value="subdomains" className="mt-4">
          <SubdomainsTab rows={data?.subdomains ?? []} act={act} loading={isLoading} />
        </TabsContent>
        <TabsContent value="dns" className="mt-4">
          <DnsTab rows={data?.dnsRecords ?? []} act={act} loading={isLoading} />
        </TabsContent>
        <TabsContent value="zone" className="mt-4">
          <ZoneTab data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Tab: Mailboxes & aliases ────────────────────────────────────────────────

function MailboxesTab({
  emails, act, loading,
}: {
  emails: EmailRow[];
  act: ActMutation;
  loading: boolean;
}) {
  if (loading) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Loading mailboxes…</CardContent></Card>;

  const categories = Array.from(new Set(emails.map((e) => e.category)));
  const order: Record<string, number> = {
    "Transactional & System": 0,
    "Business & Support": 1,
    "Legal, Privacy & Compliance": 2,
    "RFC Standards & Reputation": 3,
  };
  categories.sort((a, b) => (order[a] ?? 9) - (order[b] ?? 9));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4 text-sm">
          <span className="font-medium">Sender identity:</span>
          <CopyableCode value="Docurama Sign <notifications@docurama.eu>" />
          <span className="text-muted-foreground">
            configured in Platform Settings → SMTP - the display name improves deliverability and user trust.
          </span>
        </CardContent>
      </Card>

      {categories.map((cat) => (
        <Card key={cat}>
          <CardHeader>
            <CardTitle className="text-base">{cat}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {emails.filter((e) => e.category === cat).map((e) => (
              <div
                key={e.address}
                className="flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between"
              >
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium">{e.address}</span>
                    <StatusBadge status={e.provisioned ? "ACTIVE" : "PENDING"} />
                    <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", PRIORITY_STYLE[e.priority])}>
                      {e.priority}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    <span className="font-medium text-foreground">{e.displayName}</span>
                    {" · "}{KIND_LABEL[e.kind]}
                    {e.forwardsTo && (
                      <>{" · "}<span className="inline-flex items-center gap-1">forwards <ArrowRight className="h-3 w-3" aria-hidden /> <span className="font-mono text-xs">{e.forwardsTo}</span></span></>
                    )}
                  </p>
                  <p className="max-w-3xl text-sm leading-relaxed">{e.purpose}</p>
                  {e.notes && <p className="max-w-3xl text-xs text-muted-foreground">{e.notes}</p>}
                  {e.rfc && <p className="text-xs text-muted-foreground">Standard: {e.rfc}</p>}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Button
                    variant="outline" size="sm" className="h-10"
                    disabled={act.isPending || !e.provisioned}
                    onClick={() => act.mutate({ op: "email.test", id: e.address })}
                  >
                    <Send className="h-3.5 w-3.5" aria-hidden /> Test
                  </Button>
                  {e.provisioned ? (
                    <Button
                      variant="outline" size="sm" className="h-10 text-destructive hover:text-destructive"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ op: "email.deprovision", id: e.address })}
                    >
                      Deprovision
                    </Button>
                  ) : (
                    <Button
                      size="sm" className="h-10"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ op: "email.provision", id: e.address })}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Provision
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: Sub-domains ────────────────────────────────────────────────────────

function SubdomainsTab({
  rows, act, loading,
}: {
  rows: SubdomainRow[];
  act: ActMutation;
  loading: boolean;
}) {
  if (loading) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Loading sub-domains…</CardContent></Card>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">DNS sub-domains on docurama.eu</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="py-3 pr-4 font-medium">Host</th>
                <th className="py-3 pr-4 font-medium">Purpose</th>
                <th className="py-3 pr-4 font-medium">Record</th>
                <th className="py-3 pr-4 font-medium">Audience</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.fqdn} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <span className="font-mono font-medium">{r.fqdn}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{r.env} · TLS {r.tls}</span>
                  </td>
                  <td className="max-w-sm py-3 pr-4 text-muted-foreground">{r.purpose}</td>
                  <td className="py-3 pr-4">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{r.recordType}</span>
                    <span className="mt-0.5 block max-w-[200px] truncate font-mono text-xs text-muted-foreground" title={r.target}>
                      {r.target}
                    </span>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={r.audience === "Public" ? "ACTIVE" : "PENDING"} />
                    <span className="sr-only">{r.audience}</span>
                  </td>
                  <td className="py-3 pr-4">
                    <StatusBadge status={r.live ? "VERIFIED" : "PENDING"} />
                  </td>
                  <td className="py-3 pr-4 text-right">
                    {r.live ? (
                      <span className="text-xs text-muted-foreground">Live</span>
                    ) : (
                      <Button
                        variant="outline" size="sm" className="h-9"
                        disabled={act.isPending}
                        onClick={() => act.mutate({ op: "subdomain.verify", id: r.fqdn })}
                      >
                        Verify DNS
                      </Button>
                    )}
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

// ─── Tab: DNS records ────────────────────────────────────────────────────────

function DnsTab({
  rows, act, loading,
}: {
  rows: DnsRow[];
  act: ActMutation;
  loading: boolean;
}) {
  if (loading) return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Loading DNS records…</CardContent></Card>;

  const groups = Array.from(new Set(rows.map((r) => r.group)));

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <p className="max-w-xl text-sm text-muted-foreground">
            These records are mandatory for GDPR/eIDAS-grade email operations and healthy deliverability of signing links.
            Missing SPF, DKIM alignment or postmaster/abuse mailboxes get the domain penalised by Gmail, Outlook and Yahoo.
          </p>
          <Button
            size="sm" className="h-11"
            disabled={act.isPending}
            onClick={() => act.mutate({ op: "dns.check-all" })}
          >
            <ShieldCheck className="h-4 w-4" aria-hidden /> Re-run all checks
          </Button>
        </CardContent>
      </Card>

      {groups.map((g) => (
        <Card key={g}>
          <CardHeader>
            <CardTitle className="text-base">{g} records</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {rows.filter((r) => r.group === g).map((r) => (
              <div key={r.id} className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">{r.type}</span>
                    <span className="font-mono text-sm font-medium">{r.name}</span>
                    {r.priority !== undefined && (
                      <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">prio {r.priority}</span>
                    )}
                    <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs">TTL {r.ttl}</span>
                    <StatusBadge status={r.verified ? "VERIFIED" : "PENDING"} />
                  </div>
                  <p className="break-all font-mono text-xs text-muted-foreground">{r.value}</p>
                  <p className="max-w-3xl text-sm">{r.purpose}{r.rfc && <span className="text-muted-foreground"> · {r.rfc}</span>}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <CopyButton value={r.value} label="Copy value" />
                  {r.verified ? (
                    <Button
                      variant="ghost" size="sm" className="h-10 text-muted-foreground" disabled
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-hidden /> Verified
                    </Button>
                  ) : (
                    <Button
                      variant="outline" size="sm" className="h-10"
                      disabled={act.isPending}
                      onClick={() => act.mutate({ op: "dns.check", id: r.id })}
                    >
                      Verify record
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

// ─── Tab: Zone file & company identity ───────────────────────────────────────

function ZoneTab({ data }: { data: ProvisioningData | undefined }) {
  if (!data) {
    return <Card><CardContent className="p-10 text-center text-sm text-muted-foreground">Loading zone file…</CardContent></Card>;
  }

  const c = data.company;
  const downloadZone = () => {
    const blob = new Blob([data.zoneFile], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "docurama.eu.zone";
    a.click();
    URL.revokeObjectURL(url);
  };

  const identity: { icon: React.ReactNode; label: string; value: string; mono?: boolean }[] = [
    { icon: <Landmark className="h-4 w-4" aria-hidden />, label: "Legal name", value: c.legalName },
    { icon: <MapPin className="h-4 w-4" aria-hidden />, label: "Registered address", value: c.address },
    { icon: <Building2 className="h-4 w-4" aria-hidden />, label: "Registration", value: c.registrationNumber },
    { icon: <Hash className="h-4 w-4" aria-hidden />, label: "VAT number", value: c.vatNumber },
    { icon: <Hash className="h-4 w-4" aria-hidden />, label: "Share capital", value: c.shareCapital },
    { icon: <Phone className="h-4 w-4" aria-hidden />, label: "Phone", value: c.phone },
    { icon: <Mail className="h-4 w-4" aria-hidden />, label: "DPO / privacy", value: c.dpoEmail, mono: true },
    { icon: <Mail className="h-4 w-4" aria-hidden />, label: "Legal", value: c.legalEmail, mono: true },
    { icon: <Mail className="h-4 w-4" aria-hidden />, label: "Security", value: c.securityEmail, mono: true },
    { icon: <Globe2 className="h-4 w-4" aria-hidden />, label: "Data residency", value: c.dataResidency },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Company identity - VOIRIA SASU</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            {identity.map((f) => (
              <div key={f.label} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  {f.icon}
                </span>
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">{f.label}</p>
                  <p className={cn("text-sm font-medium", f.mono && "font-mono")}>{f.value}</p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-4 text-xs text-muted-foreground">
            Fields marked “to be updated” are placeholders - complete them with the registry values (SIREN, VAT, capital, phone)
            from the company's Kbis; they flow into the legal footer, invoices and DSAR responses.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">BIND zone file - docurama.eu</CardTitle>
          <div className="flex items-center gap-2">
            <CopyButton value={data.zoneFile} label="Copy zone" />
            <Button variant="outline" size="sm" className="h-10" onClick={downloadZone}>
              <Download className="h-3.5 w-3.5" aria-hidden /> Download .zone
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <pre className="docurama-scroll max-h-[520px] overflow-auto rounded-xl bg-muted/60 p-4 font-mono text-xs leading-relaxed">
            {data.zoneFile}
          </pre>
          <p className="mt-3 text-xs text-muted-foreground">
            Apply at the registrar (or Infoblox/Cloudflare via API) - the zone regenerates live from the provisioning state above.
            Replace the placeholder origin IPs and mail-relay targets with production values before publishing.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
