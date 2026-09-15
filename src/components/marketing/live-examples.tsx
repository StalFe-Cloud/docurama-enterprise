"use client";

/**
 * The interactive live-examples section: a tab bar of document types and
 * one self-playing product demo per tab, in the style of cursor.com/product.
 *
 * Switching tabs remounts the demo (the key), which restarts its timeline
 * from the top. Each demo pauses when scrolled out of view and respects
 * prefers-reduced-motion with a static end tableau.
 */

import { useState } from "react";
import {
  DraftingCompass, GitPullRequest, Lock, Receipt, ScrollText, type LucideIcon,
} from "lucide-react";
import { ExampleQuotation } from "./examples/quotation";
import { ExampleNda } from "./examples/nda";
import { ExampleChangeControl } from "./examples/change-control";
import { ExampleCadApproval } from "./examples/cad-approval";
import { ExampleSupplyAgreement } from "./examples/supply-agreement";

type Example = {
  id: string;
  label: string;
  icon: LucideIcon;
  caption: string;
  Component: () => React.ReactElement;
};

const EXAMPLES: Example[] = [
  {
    id: "quotation",
    label: "Quotation",
    icon: Receipt,
    caption:
      "Elisa Righi at Fonderia Padana approves quotation QT-2026-114 for cast housings. The approval is a signature: identified, timestamped and sealed to both parties.",
    Component: ExampleQuotation,
  },
  {
    id: "nda",
    label: "NDA",
    icon: Lock,
    caption:
      "A mutual NDA routes through two signers in strict order. StålFe signs first, the turn passes to Gusswerk Rheinland, and the envelope completes only when both have signed.",
    Component: ExampleNda,
  },
  {
    id: "change",
    label: "Change control",
    icon: GitPullRequest,
    caption:
      "Engineering change ECR-1042 for the GB-48 housing moves through prepare, review and approval. Every step lands in the audit trail with the signer's identity and a timestamp.",
    Component: ExampleChangeControl,
  },
  {
    id: "cad",
    label: "CAD approval",
    icon: DraftingCompass,
    caption:
      "Drawing DR-2210 draws itself: outline, bores, dimensions, title block. The design engineer's approval signature is bound to that exact revision of the drawing.",
    Component: ExampleCadApproval,
  },
  {
    id: "supply",
    label: "Supply agreement",
    icon: ScrollText,
    caption:
      "The annual supply agreement goes out from a template: title and both signers prefilled, both parties sign in sequence, and the sealed copy carries a public verification code.",
    Component: ExampleSupplyAgreement,
  },
];

export function LiveExamples() {
  const [active, setActive] = useState(EXAMPLES[0].id);
  const current = EXAMPLES.find((e) => e.id === active) ?? EXAMPLES[0];
  const Current = current.Component;

  return (
    <section id="examples" className="reveal border-b">
      <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6 lg:py-24">
        <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
          Watch a real flow for your document type
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Five live replays from the StålFe workspace. Each one runs in the
          actual product: routing, signing, sealing and evidence, with no cuts.
          Pick a document type and it plays.
        </p>

        {/* Tabs */}
        <div role="tablist" aria-label="Document types" className="mt-8 flex flex-wrap gap-2">
          {EXAMPLES.map((e, idx) => {
            const on = e.id === active;
            return (
              <button
                key={e.id}
                id={`tab-${e.id}`}
                role="tab"
                aria-selected={on}
                aria-controls={`panel-${e.id}`}
                tabIndex={on ? 0 : -1}
                onClick={() => setActive(e.id)}
                onKeyDown={(evt) => {
                  if (evt.key === "ArrowRight") {
                    evt.preventDefault();
                    const next = (idx + 1) % EXAMPLES.length;
                    setActive(EXAMPLES[next].id);
                    document.getElementById(`tab-${EXAMPLES[next].id}`)?.focus();
                  } else if (evt.key === "ArrowLeft") {
                    evt.preventDefault();
                    const prev = (idx - 1 + EXAMPLES.length) % EXAMPLES.length;
                    setActive(EXAMPLES[prev].id);
                    document.getElementById(`tab-${EXAMPLES[prev].id}`)?.focus();
                  } else if (evt.key === "Home") {
                    evt.preventDefault();
                    setActive(EXAMPLES[0].id);
                    document.getElementById(`tab-${EXAMPLES[0].id}`)?.focus();
                  } else if (evt.key === "End") {
                    evt.preventDefault();
                    const last = EXAMPLES.length - 1;
                    setActive(EXAMPLES[last].id);
                    document.getElementById(`tab-${EXAMPLES[last].id}`)?.focus();
                  }
                }}
                className={
                  "inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                  (on
                    ? "border-foreground/20 bg-card text-foreground shadow-sm"
                    : "border-transparent bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                <e.icon className="h-4 w-4" aria-hidden />
                {e.label}
              </button>
            );
          })}
        </div>

        {/* The live demo panel */}
        <div
          role="tabpanel"
          id={`panel-${current.id}`}
          aria-labelledby={`tab-${current.id}`}
          tabIndex={0}
          className="mt-4 overflow-hidden rounded-xl border bg-card shadow-[0_1px_2px_rgba(26,26,26,.05),0_24px_56px_-32px_rgba(26,26,26,.22)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Current key={current.id} />
        </div>

        <p className="mt-3 max-w-3xl text-xs leading-relaxed text-muted-foreground">
          {current.caption}
        </p>
      </div>
    </section>
  );
}
