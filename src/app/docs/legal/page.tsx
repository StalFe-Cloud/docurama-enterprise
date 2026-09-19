import { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { ShieldCheck, ArrowLeft, Globe, FileText, Lock, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Centre Juridique & Conformité · Docurama",
  description: "Politiques publiques de sécurité (PSSI), protection des données (RGPD), conformité eIDAS et déclaration d'applicabilité ISMS.",
};

export default async function LegalDocsPage() {
  // Public compliance surface: degrade to the existing empty state on a DB
  // hiccup instead of 500ing (same class as F2, modeles-de-contrats).
  let docs: Awaited<ReturnType<typeof db.complianceDocument.findMany>> = [];
  try {
    docs = await db.complianceDocument.findMany({
      where: { isPublic: true },
      orderBy: { title: "asc" },
      include: { versions: { orderBy: { createdAt: "desc" }, take: 1 } },
    });
  } catch {
    // Compliance library temporarily unavailable — empty state below.
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top navigation */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/docs" className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour à la documentation
          </Link>
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" asChild>
              <Link href="/security">Portail Sécurité</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/login">Accéder au portail</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Hero */}
        <div className="space-y-4 text-center sm:text-left">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <ShieldCheck className="h-3.5 w-3.5" /> Centre de Conformité & Réglementation
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Politiques de Sécurité, RGPD & Engagements eIDAS
          </h1>
          <p className="text-base text-muted-foreground max-w-3xl">
            Docurama SAS met en œuvre des workflows de signature électronique alignés eIDAS, avec un traitement et un hébergement des données dans l'Union européenne. Docurama n'est pas un prestataire de services de confiance qualifié et n'émet pas de certificats qualifiés.
          </p>
        </div>

        {/* Public Documents Grid */}
        <div className="mt-12 space-y-8">
          {docs.length === 0 ? (
            <div className="rounded-xl border p-8 text-center text-muted-foreground">
              Les documents publics sont en cours de mise à jour.
            </div>
          ) : (
            docs.map((doc) => (
              <section
                key={doc.id}
                id={doc.key}
                className="scroll-mt-20 rounded-xl border bg-card p-6 sm:p-8 shadow-sm space-y-6"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b pb-4">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-xl font-semibold tracking-tight">{doc.title}</h2>
                      <span className="rounded bg-primary/10 px-2 py-0.5 text-xs font-mono font-medium text-primary">
                        v{doc.version}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Dernière révision : {doc.approvedAt ? new Date(doc.approvedAt).toLocaleDateString("fr-FR", { year: "numeric", month: "long", day: "numeric" }) : "Récemment"} · Validé par {doc.approvedBy || doc.owner}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="h-3 w-3" /> En vigueur
                    </span>
                  </div>
                </div>

                {doc.summary && (
                  <p className="text-sm font-medium text-muted-foreground bg-muted/30 rounded-lg p-4">
                    {doc.summary}
                  </p>
                )}

                <div className="rounded-lg border bg-muted/10 p-5 sm:p-6 text-sm font-sans whitespace-pre-wrap leading-relaxed">
                  {doc.bodyMarkdown}
                </div>

                <div className="flex items-center justify-between text-xs text-muted-foreground pt-2">
                  <span>Référentiels associés : <code className="font-mono text-foreground">{doc.controlRefs || "ISO 27001 / RGPD"}</code></span>
                  <span>Docurama SAS · Paris, France</span>
                </div>
              </section>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
