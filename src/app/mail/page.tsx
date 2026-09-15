import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo, BRAND_LEGAL_NAME } from "@/components/brand/logo";
import { Mail, Server, ShieldCheck } from "lucide-react";

export const metadata: Metadata = {
  title: "Docurama mail service",
  description:
    "Mail infrastructure for docurama.eu: the outbound relay identity, client autoconfiguration and postmaster contacts.",
};

export default function MailPage() {
  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="mx-auto flex h-16 max-w-3xl items-center px-4 sm:px-6">
          <BrandLogo size="sm" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Mail service</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          This host is the mail relay identity for docurama.eu. It serves
          MTA-STS policy endpoints and mail-client autoconfiguration; there is
          no public webmail here.
        </p>

        <section aria-label="Relay identity" className="mt-8 space-y-4">
          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <Server className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">Outbound relay</h2>
            </div>
            <dl className="mt-4 space-y-2.5 font-mono text-xs text-muted-foreground">
              <div className="flex justify-between gap-4"><dt>Host</dt><dd className="text-foreground">mail.docurama.eu</dd></div>
              <div className="flex justify-between gap-4"><dt>Submission</dt><dd className="text-foreground">587 STARTTLS</dd></div>
              <div className="flex justify-between gap-4"><dt>IMAPS</dt><dd className="text-foreground">993 SSL</dd></div>
              <div className="flex justify-between gap-4"><dt>MTA-STS</dt><dd className="text-foreground">enforce (RFC 8460)</dd></div>
            </dl>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <Mail className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">Client autoconfiguration</h2>
            </div>
            <ul className="mt-4 space-y-2 font-mono text-xs text-muted-foreground">
              <li>Thunderbird / K-9: <span className="text-foreground">/mail/config-v1.1.xml</span></li>
              <li>Outlook: <span className="text-foreground">/autodiscover/autodiscover.xml</span></li>
            </ul>
          </div>

          <div className="rounded-xl border bg-card p-5">
            <div className="flex items-center gap-3">
              <ShieldCheck className="h-5 w-5 text-primary" aria-hidden />
              <h2 className="text-sm font-semibold">Postmaster contacts</h2>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              <li>Delivery issues: <a className="underline underline-offset-2" href="mailto:postmaster@docurama.eu">postmaster@docurama.eu</a></li>
              <li>Abuse and phishing reports: <a className="underline underline-offset-2" href="mailto:abuse@docurama.eu">abuse@docurama.eu</a></li>
              <li>DMARC reports: <a className="underline underline-offset-2" href="mailto:dmarc@docurama.eu">dmarc@docurama.eu</a></li>
            </ul>
          </div>
        </section>

        <footer className="mt-12 border-t pt-6 text-xs leading-relaxed text-muted-foreground">
          <p>
            See the <Link className="underline underline-offset-2" href="/status">platform status</Link> or{" "}
            <Link className="underline underline-offset-2" href="/docs">documentation</Link>.
          </p>
          <p className="mt-2">© 2026 {BRAND_LEGAL_NAME}.</p>
        </footer>
      </main>
    </div>
  );
}
