"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutTemplate, Plus, Trash2, PenLine, FolderOpen, FileUp, Scale } from "lucide-react";
import { apiGet, apiPost, ApiError } from "@/lib/client";
import { ConfirmDialog, EmptyState, ErrorState, PageHeader, fmtRelative } from "@/components/portal/shared";
import { pushPath } from "@/components/portal/portal-root";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

type Template = {
  id: string; name: string; description: string | null; category: string;
  folder: string; pages: number; usageCount: number; lastUsedAt: string | null; publicSlug: string;
  isBuiltIn?: boolean; sourceNotes?: string | null;
};

const CATEGORIES = ["Legal", "HR", "Sales", "Operations", "Compliance", "General"];

export function UserTemplates() {
  const [search, setSearch] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: "", description: "", category: "General", pages: 3 });
  const queryClient = useQueryClient();

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["workspace", "templates", search],
    queryFn: () => apiGet<{ rows: Template[]; folders: { name: string; count: number }[] }>(`/api/workspace/templates?q=${encodeURIComponent(search)}`),
  });

  const act = useMutation({
    mutationFn: (vars: { op: string; id?: string; data?: Record<string, unknown> }) =>
      apiPost<{ ok: boolean; message: string; template?: any }>("/api/workspace/templates", vars),
    onSuccess: (res, vars) => {
      toast.success(res.message);
      queryClient.invalidateQueries({ queryKey: ["workspace", "templates"] });
      if (vars.op === "use" && vars.id) {
        pushPath(`/documents?template=${vars.id}`);
      }
    },
    onError: (err: ApiError) => toast.error(err.message),
  });

  const rows = data?.rows ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Templates"
        description="Reusable documents with pre-configured fields. Only your workspace's real templates are shown - never sample data."
        actions={
          <Button className="h-11" onClick={() => setCreateOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden /> New template
          </Button>
        }
      />

      {/* Folder summary */}
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" className="h-11" onClick={() => setSearch("")}>
          <FolderOpen className="h-4 w-4" aria-hidden /> All templates
          <span className="ml-1.5 rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">{rows.length}</span>
        </Button>
        {(data?.folders ?? []).map((f) => (
          <Button key={f.name} variant="ghost" size="sm" className="h-11" onClick={() => setSearch(f.name)}>
            {f.name} <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">{f.count}</span>
          </Button>
        ))}
      </div>

      {error ? (
        <ErrorState message={(error as Error).message} onRetry={() => refetch()} />
      ) : isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-busy>
          {Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-44 animate-pulse rounded-xl bg-muted" />)}
        </div>
      ) : rows.length === 0 ? (
        <Card>
          <CardContent>
            {/* Honest empty state - the original app rendered fake demo templates here */}
            <EmptyState
              icon={LayoutTemplate}
              title={search ? "No templates match your search" : "No templates yet"}
              description={search
                ? "Try a different keyword or clear the folder filter."
                : "Upload a PDF to create your first reusable template. Fields can be placed automatically or manually."}
              action={
                <Button className="h-11" onClick={() => setCreateOpen(true)}>
                  <FileUp className="h-4 w-4" aria-hidden /> Create template
                </Button>
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((t) => (
            <Card key={t.id} className="group flex flex-col">
              <CardContent className="flex flex-1 flex-col gap-3 p-5">
                <div className="flex items-start justify-between gap-2">
                  <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft">
                    {t.isBuiltIn ? (
                      <Scale className="h-5 w-5 text-primary" aria-hidden />
                    ) : (
                      <LayoutTemplate className="h-5 w-5 text-primary" aria-hidden />
                    )}
                  </span>
                  <div className="flex items-center gap-1.5 flex-wrap justify-end">
                    {t.isBuiltIn && (
                      <span className="inline-flex items-center gap-1 rounded-md bg-primary/10 border border-primary/20 px-2 py-0.5 text-xs font-semibold text-primary">
                        <Scale className="h-3 w-3" /> Droit Français
                      </span>
                    )}
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">{t.category}</span>
                  </div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="mt-0.5 line-clamp-2 min-h-[2rem] text-xs text-muted-foreground">{t.description ?? "No description"}</p>
                  {t.sourceNotes && (
                    <p className="mt-1 text-[11px] font-mono text-muted-foreground/80 truncate">
                      Statut: {t.sourceNotes}
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  {t.pages} pages · used {t.usageCount}× · last {fmtRelative(t.lastUsedAt)}
                </p>
                <div className="flex items-center gap-2">
                  <Button size="sm" className="h-11 flex-1" onClick={() => act.mutate({ op: "use", id: t.id })}>
                    <PenLine className="h-4 w-4" aria-hidden /> Use template
                  </Button>
                  {!t.isBuiltIn && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="icon" className="h-11 w-11" aria-label={`More actions for ${t.name}`}>
                          ⋯
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          variant="destructive"
                          onClick={() => act.mutate({ op: "delete", id: t.id })}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden /> Delete template
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Create a template</DialogTitle>
            <DialogDescription>
              Templates keep signature fields consistent. In production this wizard accepts a PDF upload; here you register the template metadata.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-name">Template name</Label>
              <Input id="tpl-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Consulting Agreement 2026" className="h-11" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-desc">Description</Label>
              <Textarea id="tpl-desc" rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="What this template is used for" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="tpl-cat">Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger id="tpl-cat" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="tpl-pages">Pages</Label>
                <Input id="tpl-pages" type="number" min={1} max={200} value={form.pages} onChange={(e) => setForm({ ...form, pages: Number(e.target.value) })} className="h-11" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={() => act.mutate({ op: "create", data: form })} disabled={!form.name.trim() || act.isPending}>
              {act.isPending && act.variables?.op === "create" ? "Creating…" : "Create template"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
