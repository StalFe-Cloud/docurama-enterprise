"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import QRCode from "qrcode";
import { Bell, Ban, Eye, FileSignature, Send, Plus, Trash2, UploadCloud, FileText, Loader2, Scale, Link2, QrCode, FileArchive, ServerCog } from "lucide-react";
import { apiGet, apiPost, apiUpload, ApiError } from "@/lib/client";
import {
  Column, ConfirmDialog, CopyableCode, DataTable, PageHeader, StatusBadge, fmtDate, fmtRelative,
} from "@/components/portal/shared";
import { pushPath } from "@/components/portal/portal-root";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";

type Recipient = { id: string; name: string; email: string; role: string; status: string; order: number; authMethod: string; signedAt: string | null; signLink?: string | null };
type EnvelopeRow = {
  id: string; publicCode: string; title: string; status: string; createdAt: string;
  createdBy: string; sealedAt: string | null; conformanceLevel: string | null; sha256: string | null;
  pages: number; lastRemindedAt: string | null; voidReason: string | null;
  attestedAt: string | null; attestStatus: string | null; verifiedSenderDomain: string | null;
  recipients: Recipient[];
};
type EnvelopeDetail = {
  envelope: EnvelopeRow;
  recipients: Recipient[];
  tenantName?: string;
  events: { id: string; at: string; actor: string; action: string; detail: string | null; ipHash: string | null }[];
};

const STATUS_TABS = ["ALL", "SENT", "PARTIALLY_SIGNED", "COMPLETED", "VOIDED", "DECLINED", "EXPIRED"];

/**
 * QR handoff for a pending signer: renders the personal signing link as a
 * scannable code so the envelope owner can hand the phone/tablet (or the
 * link itself) to the signer in the room. Roadmap item #2 — removes the
 * "I'll do it at my desk" failure mode.
 */
function SignLinkQr({ name, path }: { name: string; path: string }) {
  const [dataUrl, setDataUrl] = useState<string | null>(null);
  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}${path}`, {
      width: 220, margin: 1, color: { dark: "#0f172a", light: "#ffffff" },
    }).then(setDataUrl).catch(() => setDataUrl(null));
  }, [path]);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Show signing QR for ${name}`} title="QR handoff">
          <QrCode className="h-4 w-4" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="end">
        <div className="space-y-2 text-center">
          {dataUrl ? (
            <img src={dataUrl} alt={`Signing link QR for ${name}`} width={220} height={220} className="rounded-md border" />
          ) : (
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
          )}
          <p className="max-w-[220px] text-xs text-muted-foreground">
            {name} scans this to open their personal signing page on their phone.
          </p>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function UserDocuments() {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [detailId, setDetailId] = useState<string | null>(null);
  const [sendOpen, setSendOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<{ id: string; name: string; pages: number; category: string } | null>(null);
  const [uploadedDoc, setUploadedDoc] = useState<{ id: string; filename: string; pageCount: number; byteSize: number } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({ title: "", message: "", recipients: [{ name: "", email: "" }, { name: "", email: "" }] });
  const queryClient = useQueryClient();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const sp = new URLSearchParams(window.location.search);
    const templateId = sp.get("template");
    if (!templateId) return;

    apiGet<{ rows: { id: string; name: string; pages: number; category: string; publicSlug?: string }[] }>("/api/workspace/templates")
      .then((res) => {
        const match = (res.rows ?? []).find((t) => t.id === templateId || t.publicSlug === templateId);
        if (match) {
          setUploadedDoc(null);
          setSelectedTemplate({ id: match.id, name: match.name, pages: match.pages, category: match.category });
          setForm((prev) => ({
            ...prev,
            title: prev.title.trim() ? prev.title : match.name,
            message: `Please review and sign ${match.name}.`,
          }));
          setSendOpen(true);
          toast.success(`Loaded template: ${match.name}`);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        pushPath("/documents");
      });
  }, []);

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "envelopes", page, search, status],
    queryFn: () => apiGet<{ rows: EnvelopeRow[]; total: number; perPage: number; myQueue: EnvelopeRow[] }>(`/api/workspace/envelopes?page=${page}&perPage=10&status=${status}&q=${encodeURIComponent(search)}`),
  });

  const detail = useQuery({
    queryKey: ["workspace", "envelope-detail", detailId],
    queryFn: () => apiGet<EnvelopeDetail>(`/api/workspace/envelope-detail?id=${detailId}`),
    enabled: !!detailId,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ["workspace", "envelopes"] });
    queryClient.invalidateQueries({ queryKey: ["workspace", "overview"] });
    queryClient.invalidateQueries({ queryKey: ["workspace", "envelope-detail"] });
  };

  const act = useMutation({
    mutationFn: (vars: { op: string; id?: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string }>("/api/workspace/envelopes", vars),
    onSuccess: (res) => { toast.success(res.message); invalidate(); },
    onError: (err: ApiError) => toast.error(err.message),
  });

  async function handleFileUpload(file: File) {
    if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") {
      toast.error("Only PDF files are supported");
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      toast.error("File exceeds 50 MB limit");
      return;
    }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await apiUpload<{ id: string; filename: string; pageCount: number; byteSize: number }>("/api/workspace/documents", fd);
      setUploadedDoc(res);
      setSelectedTemplate(null);
      const cleanName = file.name.replace(/\.pdf$/i, "").replace(/[-_]+/g, " ");
      setForm((prev) => ({ ...prev, title: prev.title.trim() ? prev.title : cleanName }));
      toast.success(`Uploaded ${res.filename} (${res.pageCount} page${res.pageCount > 1 ? "s" : ""})`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to upload document");
    } finally {
      setUploading(false);
    }
  }

  const send = useMutation({
    mutationFn: () => apiPost<{ ok: boolean; message: string }>("/api/workspace/envelopes", {
      op: "send",
      data: {
        title: form.title,
        message: form.message,
        documentId: uploadedDoc?.id,
        templateId: selectedTemplate?.id,
        recipients: form.recipients.filter((r) => r.email.trim()),
      },
    }),
    onSuccess: (res) => {
      toast.success(res.message);
      setSendOpen(false);
      setUploadedDoc(null);
      setSelectedTemplate(null);
      setForm({ title: "", message: "", recipients: [{ name: "", email: "" }, { name: "", email: "" }] });
      invalidate();
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const columns: Column<EnvelopeRow>[] = [
    {
      key: "title", header: "Document",
      render: (e) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{e.title}</p>
          <p className="font-mono text-xs text-muted-foreground">{e.publicCode} · {e.pages} pages</p>
        </div>
      ),
    },
    {
      key: "signers", header: "Signers",
      render: (e) => {
        const signers = e.recipients.filter((r) => r.role !== "CC");
        const signed = signers.filter((r) => r.status === "SIGNED").length;
        return (
          <div className="w-28 space-y-1">
            <p className="text-xs tabular-nums text-muted-foreground">{signed}/{signers.length} signed</p>
            <Progress value={signers.length ? (signed / signers.length) * 100 : 0} aria-label={`${signed} of ${signers.length} signed`} />
          </div>
        );
      },
    },
    { key: "status", header: "Status", render: (e) => <StatusBadge status={e.status} /> },
    { key: "sent", header: "Sent", render: (e) => <span className="whitespace-nowrap text-sm text-muted-foreground">{fmtRelative(e.createdAt)}</span> },
    {
      key: "digest", header: "Evidence digest",
      render: (e) => e.sha256 ? <CopyableCode value={e.sha256} max={12} /> : <span className="text-xs text-muted-foreground">not sealed</span>,
    },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, className: "w-36",
      render: (e) => (
        <div className="flex justify-end gap-1">
          {/* Row actions stop propagation: without it, the click bubbles to
              the row's onRowClick and opens the detail sheet UNDERNEATH the
              action's own dialog (two Radix overlays fighting for focus). */}
          <Button
            variant="ghost" size="icon" className="h-11 w-11"
            aria-label={`Open details for ${e.title}`} title="Details"
            onClick={(ev) => { ev.stopPropagation(); setDetailId(e.id); }}
          >
            <Eye className="h-4 w-4" aria-hidden />
          </Button>
          {["SENT", "PARTIALLY_SIGNED"].includes(e.status) && (
            <Button
              variant="ghost" size="icon" className="h-11 w-11"
              aria-label={`Send reminder for ${e.title}`} title="Send reminder"
              disabled={act.isPending}
              onClick={(ev) => { ev.stopPropagation(); act.mutate({ op: "remind", id: e.id }); }}
            >
              <Bell className="h-4 w-4" aria-hidden />
            </Button>
          )}
          {["SENT", "PARTIALLY_SIGNED", "DRAFT"].includes(e.status) && (
            <ConfirmDialog
              trigger={
                <Button
                  variant="ghost" size="icon" className="h-11 w-11 text-destructive"
                  aria-label={`Void ${e.title}`} title="Void envelope"
                  onClick={(ev) => ev.stopPropagation()}
                >
                  <Ban className="h-4 w-4" aria-hidden />
                </Button>
              }
              title="Void this envelope?"
              description={`${e.title} - signers are notified immediately and the audit trail records your reason verbatim.`}
              confirmLabel="Void envelope"
              requireReason
              onConfirm={(reason) => act.mutateAsync({ op: "void", id: e.id, data: { reason } })}
            />
          )}
        </div>
      ),
    },
  ];

  const env = detail.data?.envelope;
  const validRecipients = form.recipients.filter((r) => r.email.includes("@"));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Documents"
        description="Every envelope your workspace has sent - with signer progress, reminders and cryptographic evidence."
        actions={
          <Button className="h-11" onClick={() => setSendOpen(true)}>
            <Send className="h-4 w-4" aria-hidden /> New envelope
          </Button>
        }
      />

      <Tabs value={status} onValueChange={(v) => { setStatus(v); setPage(1); }}>
        <TabsList className="h-11 flex-wrap">
          {STATUS_TABS.map((s) => (
            <TabsTrigger key={s} value={s} className="min-h-9">
              {s === "ALL" ? "All" : s.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase())}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <DataTable<EnvelopeRow>
        ariaLabel="Documents"
        columns={columns}
        rows={data?.rows ?? []}
        total={data?.total}
        page={page}
        perPage={data?.perPage ?? 10}
        loading={isLoading}
        error={error ? (error as Error).message : null}
        onPageChange={setPage}
        onSearch={(q) => { setSearch(q); setPage(1); }}
        searchPlaceholder="Search documents…"
        onRetry={() => refetch()}
        onRowClick={(row) => setDetailId(row.id)}
        emptyTitle={status === "ALL" ? "No documents yet" : "No documents with this status"}
        emptyDescription={status === "ALL" ? "Send your first envelope - recipients sign in their browser, no account needed." : "Try another status filter."}
        emptyAction={
          status === "ALL" ? (
            <Button size="sm" className="h-11" onClick={() => setSendOpen(true)}>
              <Send className="h-4 w-4" aria-hidden /> Send a document
            </Button>
          ) : undefined
        }
      />

      {/* Detail sheet with audit trail */}
      <Sheet open={!!detailId} onOpenChange={(v) => !v && setDetailId(null)}>
        <SheetContent side="right" aria-describedby={undefined} className="docurama-scroll w-full overflow-y-auto sm:max-w-lg">
          <SheetTitle className="sr-only">Envelope details</SheetTitle>
          {detail.isLoading || !env ? (
            <div className="space-y-4 p-6" aria-busy>
              <div className="h-8 w-48 animate-pulse rounded-md bg-muted" />
              <div className="h-40 animate-pulse rounded-xl bg-muted" />
              <div className="h-56 animate-pulse rounded-xl bg-muted" />
            </div>
          ) : (
            <div className="space-y-6 p-6">
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold tracking-tight">{env.title}</h2>
                    <p className="font-mono text-xs text-muted-foreground">{env.publicCode}</p>
                  </div>
                  <StatusBadge status={env.status} />
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Sent by {env.createdBy} · {fmtDate(env.createdAt, true)} · {env.pages} pages
                </p>
              </div>

              {env.voidReason && (
                <p className="rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
                  Voided: {env.voidReason}
                </p>
              )}

              {/* Evidence */}
              {env.sealedAt && (
                <section aria-labelledby="evidence" className="space-y-2 rounded-xl border bg-card p-4">
                  <h3 id="evidence" className="text-sm font-semibold">Cryptographic evidence</h3>
                  <div className="space-y-1.5 text-sm">
                    <p className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Sealed</span>
                      <span>{fmtDate(env.sealedAt, true)}</span>
                    </p>
                    <p className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Conformance</span>
                      <span>PAdES {env.conformanceLevel}</span>
                    </p>
                    {env.verifiedSenderDomain && (
                      <p className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Sender domain</span>
                        <span className="font-medium text-primary-deep">{env.verifiedSenderDomain} · DNS TXT verified</span>
                      </p>
                    )}
                    <p className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-muted-foreground">SHA-256 digest</span>
                      {env.sha256 && <CopyableCode value={env.sha256} max={22} />}
                    </p>
                    {env.attestedAt && (
                      <p className="flex items-center justify-between gap-2">
                        <span className="text-muted-foreground">Public portal</span>
                        <span className="flex items-center gap-1.5 font-medium text-primary-deep">
                          <ServerCog className="h-3.5 w-3.5" aria-hidden /> fingerprint attested {fmtDate(env.attestedAt)}
                        </span>
                      </p>
                    )}
                  </div>
                  <a
                    href={`/api/evidence-pack/${env.id}`}
                    data-testid="evidence-pack-download"
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <FileArchive className="h-4 w-4" aria-hidden /> Evidence pack (.zip)
                  </a>
                  <p className="text-xs text-muted-foreground">
                    The digest is derived from the sealed file itself and can be re-verified at any time on the public portal.
                    The pack adds a signed manifest, the full ledger, the bilingual certificate and an offline verifier.
                  </p>
                </section>
              )}

              {/* Signers */}
              <section aria-labelledby="signers">
                <h3 id="signers" className="mb-2 text-sm font-semibold">Signers</h3>
                <ol className="space-y-1.5">
                  {/* recipients live at the top level of the detail response
                      (WS9a moved them out of the envelope object) */}
                  {(detail.data?.recipients ?? []).map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 rounded-lg border bg-card p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary" aria-hidden>
                          {r.order}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{r.name}</p>
                          <p className="truncate text-xs text-muted-foreground">
                            {r.email} · {r.authMethod === "SMS" ? "SMS verification" : "email verification"}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <div className="flex items-center gap-1.5">
                          {r.signLink && (
                            <>
                              <Button
                                variant="ghost" size="icon" className="h-8 w-8"
                                aria-label={`Copy signing link for ${r.name}`} title="Copy signing link"
                                onClick={() => {
                                  navigator.clipboard.writeText(`${window.location.origin}${r.signLink}`).then(
                                    () => toast.success("Signing link copied — it opens as this signer"),
                                    () => toast.error("Could not copy the link"),
                                  );
                                }}
                              >
                                <Link2 className="h-4 w-4" aria-hidden />
                              </Button>
                              <SignLinkQr name={r.name} path={r.signLink} />
                            </>
                          )}
                          <StatusBadge status={r.status} />
                        </div>
                        {r.signedAt && <span className="text-[11px] text-muted-foreground">{fmtDate(r.signedAt, true)}</span>}
                      </div>
                    </li>
                  ))}
                </ol>
                <p className="mt-2 text-xs text-muted-foreground">
                  Signing links are unique per recipient - tokens are never shared between signers.
                </p>
              </section>

              <Separator />

              {/* Audit trail */}
              <section aria-labelledby="audit">
                <h3 id="audit" className="mb-2 text-sm font-semibold">Audit trail</h3>
                <ol className="relative space-y-4 border-l pl-4">
                  {(detail.data?.events ?? []).map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden />
                      <p className="text-sm font-medium capitalize">{ev.action.toLowerCase().replace(/_/g, " ")}</p>
                      <p className="text-xs text-muted-foreground">
                        {ev.actor} · {fmtDate(ev.at, true)}
                      </p>
                      {ev.detail && <p className="mt-0.5 text-xs text-muted-foreground">{ev.detail}</p>}
                    </li>
                  ))}
                </ol>
              </section>

              {["SENT", "PARTIALLY_SIGNED"].includes(env.status) && (
                <Button
                  className="h-11 w-full"
                  disabled={act.isPending}
                  onClick={() => act.mutate({ op: "remind", id: env.id })}
                >
                  <Bell className="h-4 w-4" aria-hidden /> Send reminder (rate-limited to 1 per 6h)
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Send dialog */}
      <Dialog open={sendOpen} onOpenChange={setSendOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Send a document for signature</DialogTitle>
            <DialogDescription>
              Recipients receive a personal signing link - each token is unique and never exposed to other parties.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {/* Selected template context if opened from templates catalog */}
            {selectedTemplate && (
              <div className="flex items-center justify-between rounded-lg border border-primary/20 bg-primary/5 p-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Scale className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-primary">{selectedTemplate.name}</p>
                    <p className="text-xs text-muted-foreground">
                      Modèle officiel · {selectedTemplate.pages} page{selectedTemplate.pages > 1 ? "s" : ""} · {selectedTemplate.category}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setSelectedTemplate(null)}
                >
                  Détacher
                </Button>
              </div>
            )}

            {/* Document upload step */}
            <div className="space-y-1.5">
              <Label>Document file (PDF)</Label>
              {!uploadedDoc && !selectedTemplate && <p className="text-xs text-muted-foreground">Upload a PDF or choose a template before sending.</p>}
              {uploadedDoc ? (
                <div className="flex items-center justify-between rounded-lg border bg-card p-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{uploadedDoc.filename}</p>
                      <p className="text-xs text-muted-foreground">
                        {uploadedDoc.pageCount} page{uploadedDoc.pageCount > 1 ? "s" : ""} · {Math.round(uploadedDoc.byteSize / 1024)} KB
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => setUploadedDoc(null)}
                  >
                    Replace
                  </Button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center gap-1.5 rounded-lg border-2 border-dashed p-4 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors">
                  <input
                    type="file"
                    accept="application/pdf,.pdf"
                    className="sr-only"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                  />
                  {uploading ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                      <Loader2 className="h-4 w-4 animate-spin text-primary" />
                      <span>Ingesting and extracting pages…</span>
                    </div>
                  ) : (
                    <>
                      <UploadCloud className="h-6 w-6 text-muted-foreground" />
                      <p className="text-xs font-medium text-foreground">Click to upload or drag & drop</p>
                      <p className="text-[11px] text-muted-foreground">PDF up to 50 MB</p>
                    </>
                  )}
                </label>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="doc-title">Document title</Label>
              <Input
                id="doc-title" value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="e.g. Mutual NDA - Aurora Legal" className="h-11"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doc-message">Message to signers</Label>
              <Textarea
                id="doc-message" rows={2} value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                placeholder="Optional context shown on the signing page"
              />
            </div>
            <div className="space-y-2">
              <Label>Recipients (sign in routing order)</Label>
              {form.recipients.map((r, i) => (
                <div key={i} className="flex gap-2">
                  <Input
                    id={`recipient-${i + 1}-name`}
                    aria-label={`Recipient ${i + 1} name`}
                    value={r.name} placeholder="Name"
                    onChange={(e) => {
                      const next = [...form.recipients];
                      next[i] = { ...next[i], name: e.target.value };
                      setForm({ ...form, recipients: next });
                    }}
                    className="h-11"
                  />
                  <Input
                    id={`recipient-${i + 1}-email`}
                    aria-label={`Recipient ${i + 1} email`}
                    type="email" value={r.email} placeholder="name@company.com"
                    onChange={(e) => {
                      const next = [...form.recipients];
                      next[i] = { ...next[i], email: e.target.value };
                      setForm({ ...form, recipients: next });
                    }}
                    className="h-11"
                  />
                  {form.recipients.length > 1 && (
                    <Button
                      variant="ghost" size="icon" className="h-11 w-11 shrink-0 text-muted-foreground"
                      aria-label={`Remove recipient ${i + 1}`}
                      onClick={() => setForm({ ...form, recipients: form.recipients.filter((_, j) => j !== i) })}
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </Button>
                  )}
                </div>
              ))}
              {form.recipients.length < 5 && (
                <Button
                  variant="outline" size="sm" className="h-11"
                  onClick={() => setForm({ ...form, recipients: [...form.recipients, { name: "", email: "" }] })}
                >
                  <Plus className="h-4 w-4" aria-hidden /> Add recipient
                </Button>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSendOpen(false)}>Cancel</Button>
            <Button
              onClick={() => send.mutate()}
              disabled={!form.title.trim() || validRecipients.length === 0 || (!uploadedDoc && !selectedTemplate) || send.isPending || uploading}
            >
              {send.isPending ? "Sending…" : validRecipients.length > 0 ? `Send for signature (${validRecipients.length})` : "Send for signature"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
