import { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/db";
import { FileText, ArrowRight, Shield, Scale, Check, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LanguageSwitcher } from "@/components/i18n/language-switcher";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  alternates: { canonical: "/modeles-de-contrats" },
  title: "Modèles de Contrats Juridiques Français · Docurama",
  description: "Bibliothèque de modèles de contrats rédigés sous le droit français : accords de confidentialité, CDI, CDD, baux commerciaux, CGV et pactes d'associés prêts à signer.",
};

export default async function ModelesContratsPage() {
  // Public marketing surface: a database hiccup (wrong DATABASE_URL, locked
  // SQLite file, pending migration) must degrade to an empty state, never a
  // 500 (finding F2 in docs/IMPROVEMENT-PLAN.md).
  let templates: Awaited<ReturnType<typeof db.template.findMany>> = [];
  try {
    templates = await db.template.findMany({
      where: { isBuiltIn: true },
      orderBy: { name: "asc" },
    });
  } catch {
    // Catalog temporarily unavailable — render the empty state below.
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
            Docurama
          </Link>
          <div className="flex items-center gap-3">
            <LanguageSwitcher />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/docs">Documentation</Link>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <Link href="/login?next=/templates">Se connecter</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/welcome?next=/templates">Essai gratuit 14 jours</Link>
            </Button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        {/* Hero */}
        <div className="text-center space-y-4 max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Scale className="h-3.5 w-3.5" /> Droit Français & Code Civil
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-5xl">
            Modèles de Contrats Prêts à Signer
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground">
            Actes juridiques complets avec clauses de conformité statutaires (Code civil, Code de commerce, Code du travail et RGPD).
          </p>
        </div>

        {/* Templates Grid — or graceful empty state when the catalog is unavailable */}
        {templates.length === 0 ? (
          <div className="mt-12 rounded-xl border bg-card p-10 text-center shadow-sm">
            <FileText className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden />
            <h2 className="mt-4 text-lg font-semibold">Catalogue momentanément indisponible</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              La bibliothèque de modèles est en cours de mise à jour. Veuillez réessayer dans quelques instants.
            </p>
            <Button className="mt-6" size="sm" asChild>
              <Link href="/login?next=/templates">Accéder à l'espace de travail</Link>
            </Button>
          </div>
        ) : (
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {templates.map((t) => {
            const fieldsCount = t.fields ? (JSON.parse(t.fields) as any[]).length : 2;
            return (
              <div
                key={t.id}
                className="flex flex-col justify-between rounded-xl border bg-card p-6 shadow-sm hover:border-primary/50 transition-colors"
              >
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                      {t.category}
                    </span>
                    <span className="text-xs text-muted-foreground font-mono">
                      {t.pages} page{t.pages > 1 ? "s" : ""}
                    </span>
                  </div>

                  <h2 className="text-lg font-semibold tracking-tight text-foreground line-clamp-2">
                    {t.name}
                  </h2>

                  <p className="text-xs text-muted-foreground line-clamp-3">
                    {t.description || "Modèle contractuel rédigé conformément au droit français."}
                  </p>

                  {t.sourceNotes && (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Base légale : </span>
                      {t.sourceNotes}
                    </div>
                  )}
                </div>

                <div className="mt-6 pt-4 border-t flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <span className="text-xs text-muted-foreground">
                    {fieldsCount} champ{fieldsCount > 1 ? "s" : ""} de signature
                  </span>
                  <div className="flex items-center gap-2">
                    <Button variant="ghost" size="sm" className="text-xs" asChild>
                      <Link href="/login?next=/templates">Connexion</Link>
                    </Button>
                    <Button size="sm" asChild>
                      <Link href={`/welcome?template=${t.publicSlug || t.id}&next=/templates`}>
                        Utiliser ce modèle <ArrowRight className="h-3.5 w-3.5 ml-1" />
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
        )}
      </main>
    </div>
  );
}
