"use client";

/**
 * Live bento demo · the documents table.
 *
 * An ambient, cursor-free replay of the StålFe documents workspace: rows
 * land, statuses evolve (draft to sent, partially signed to completed),
 * progress bars fill, a reminder goes out, and evidence digests type
 * themselves in as envelopes seal.
 */

import { FileSignature, FileText } from "lucide-react";
import {
  DemoCanvas, DemoChip, INK, MUTED, FAINT, HAIR,
  SOFT, EMERALD, ToastCard, useExample,
} from "./demo-kit";

const W = 780;
const H = 520;

const HASH_A = "4d81e0c77a12";
const HASH_B = "b7e2d1f04a9c";

type Row = {
  title: string;
  code: string;
  total: number;
  base: 0 | 1 | 2;
  status: "DRAFT" | "SENT" | "PARTIALLY_SIGNED" | "COMPLETED";
  digest: string | null;
};

const ROWS: Row[] = [
  { title: "Quotation QT-2026-114 · Cast Housings", code: "DOC-2K9W4C", total: 1, base: 0, status: "SENT", digest: null },
  { title: "Mutual NDA · Gusswerk Rheinland", code: "DOC-2M4T8K", total: 2, base: 1, status: "PARTIALLY_SIGNED", digest: null },
  { title: "Change Request ECR-1042 · Risers and Gating", code: "DOC-6C1H9P", total: 3, base: 0, status: "DRAFT", digest: null },
  { title: "Supply Agreement 2026 · Nordjärm Gjuteri", code: "DOC-4N7Q2K", total: 2, base: 2, status: "COMPLETED", digest: "6b1e94d0f7c2" },
  { title: "Drawing Approval DR-2210 · GB-48 Housing", code: "DOC-8J5R1T", total: 1, base: 1, status: "COMPLETED", digest: "c93a58e1d7b4" },
  { title: "EN 10204 3.1 Mill Certificate · S355J2 Plates", code: "DOC-8P4K2M", total: 1, base: 1, status: "COMPLETED", digest: "9f2c7e41a8b3" },
];

type State = {
  rows: boolean;
  ecrSent: boolean;
  reminder: boolean;
  ndaFull: boolean;
  ndaDone: boolean;
  quoteSigning: boolean;
  quoteDone: boolean;
  digestA: string;
  digestB: string;
  exit: boolean;
};

const INITIAL: State = {
  rows: false, ecrSent: false, reminder: false, ndaFull: false, ndaDone: false,
  quoteSigning: false, quoteDone: false, digestA: "", digestB: "", exit: false,
};

const FINAL: State = {
  ...INITIAL, rows: true, ecrSent: true, ndaFull: true, ndaDone: true,
  quoteDone: true, digestA: HASH_A, digestB: HASH_B,
};

export function TableDemo() {
  const { st, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set }) => {
      tl.at(250, () => set({ rows: true }));
      tl.at(2100, () => set({ ecrSent: true }));                 // ECR row DRAFT -> SENT
      tl.at(3600, () => set({ reminder: true }));                // reminder toast
      tl.at(5600, () => set({ reminder: false }));
      tl.at(4400, () => set({ ndaFull: true }));                 // NDA 1/2 -> 2/2
      tl.at(5600, () => set({ ndaDone: true }));                 // NDA -> COMPLETED
      const tA = tl.typeText(6100, HASH_A, (s) => set({ digestA: s }), 26, 22);
      tl.at(7300, () => set({ quoteSigning: true }));            // Quotation 0/1 -> 1/1
      tl.at(8600, () => set({ quoteDone: true }));               // Quotation -> COMPLETED
      const tB = tl.typeText(9100, HASH_B, (s) => set({ digestB: s }), 26, 22);
      tl.at(tB + 2600, () => set({ exit: true }));
      return tB + 3050;
    },
  });

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H} minScale={0.6}
        label="Live view of the StålFe documents workspace: envelopes move from draft to sent to completed, progress bars fill, reminders go out, and evidence digests appear as documents seal."
      >
        <div style={{ position: "absolute", inset: 0, background: "#fff", opacity: st.exit ? 0 : 1, transition: "opacity .4s ease" }}>
          {/* Header */}
          <div style={{ position: "absolute", left: 20, top: 16 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: "-.01em" }}>Documents</p>
            <p style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>Signer progress, reminders and cryptographic evidence.</p>
          </div>
          <div style={{ position: "absolute", right: 20, top: 18, width: 132, height: 30, borderRadius: 8, background: SOFT, border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 6, paddingLeft: 9 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4"><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
            <span style={{ fontSize: 9.5, color: FAINT }}>Search…</span>
          </div>

          {/* Tabs */}
          <div style={{ position: "absolute", left: 20, top: 64, display: "flex", gap: 16 }}>
            {["All", "Sent", "Partially signed", "Completed", "Draft"].map((t, i) => (
              <span key={t} style={{ position: "relative", fontSize: 10, fontWeight: i === 0 ? 600 : 500, color: i === 0 ? INK : FAINT, paddingBottom: 6 }}>
                {t}
                {i === 0 ? <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 2, background: EMERALD }} /> : null}
              </span>
            ))}
          </div>

          {/* Table */}
          <div style={{ position: "absolute", left: 20, right: 20, top: 94 }}>
            <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 108px 118px 118px", padding: "0 0 7px", borderBottom: `1px solid ${HAIR}` }}>
              {["DOCUMENT", "SIGNERS", "STATUS", "EVIDENCE"].map((h) => (
                <span key={h} style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".07em", color: FAINT }}>{h}</span>
              ))}
            </div>

            {ROWS.map((r, i) => {
              const isQuote = i === 0;
              const isNda = i === 1;
              const isEcr = i === 2;

              const status = isEcr
                ? (st.ecrSent ? "SENT" : "DRAFT")
                : isNda
                  ? (st.ndaDone ? "COMPLETED" : "PARTIALLY_SIGNED")
                  : isQuote
                    ? (st.quoteDone ? "COMPLETED" : "SENT")
                    : r.status;

              const signed = isEcr
                ? (st.ecrSent ? 0 : 0)
                : isNda
                  ? (st.ndaFull ? 2 : 1)
                  : isQuote
                    ? (st.quoteSigning ? 1 : 0)
                    : r.base;

              const digest = isNda
                ? (st.digestA || null)
                : isQuote
                  ? (st.digestB || null)
                  : r.digest;

              const typing = (isNda && st.digestA.length > 0 && st.digestA.length < HASH_A.length)
                || (isQuote && st.digestB.length > 0 && st.digestB.length < HASH_B.length);

              return (
                <div
                  key={r.code}
                  style={{
                    position: "relative",
                    height: 56,
                    display: "grid",
                    gridTemplateColumns: "minmax(0,1fr) 108px 118px 118px",
                    alignItems: "center",
                    borderBottom: i < ROWS.length - 1 ? `1px solid #f0eeec` : "none",
                    opacity: st.rows ? 1 : 0,
                    transform: st.rows ? "none" : "translateY(12px)",
                    transition: `opacity .4s ease ${(i * 95).toString()}ms, transform .4s cubic-bezier(.22,1,.36,1) ${(i * 95).toString()}ms`,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 9, minWidth: 0 }}>
                    <span style={{ width: 27, height: 27, borderRadius: 7, background: SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      {r.status === "COMPLETED" && !isQuote && !isNda
                        ? <FileSignature size={12} color={MUTED} />
                        : <FileText size={12} color={MUTED} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: "block", fontSize: 10.5, fontWeight: 500, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                      <span style={{ display: "block", fontSize: 8, color: FAINT, fontFamily: "var(--font-geist-mono), monospace", marginTop: 1 }}>{r.code}</span>
                    </span>
                  </div>
                  <div>
                    <span style={{ fontSize: 9, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{signed}/{r.total} signed</span>
                    <span style={{ display: "block", width: 64, height: 4, borderRadius: 4, background: "#f0eeec", marginTop: 4, overflow: "hidden" }}>
                      <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 4, background: EMERALD, transform: `scaleX(${r.total ? signed / r.total : 0})`, transformOrigin: "left", transition: "transform .6s cubic-bezier(.22,1,.36,1) .15s" }} />
                    </span>
                  </div>
                  <div><DemoChip status={status} pop={`td-${r.code}-${status}`} /></div>
                  <div>
                    {digest ? (
                      <span style={{ fontSize: 8.5, color: MUTED, fontFamily: "var(--font-geist-mono), monospace" }}>
                        {digest}{typing ? <span className="hero-caret" style={{ color: EMERALD }}>|</span> : "…"}
                      </span>
                    ) : (
                      <span style={{ fontSize: 9, color: "#c8c4be" }}>not sealed</span>
                    )}
                  </div>
                  {((isEcr && st.ecrSent) || (isNda && st.ndaDone) || (isQuote && st.quoteDone)) && (
                    <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} className="hero-row-flash" />
                  )}
                </div>
              );
            })}
          </div>

          {/* Footer */}
          <div style={{ position: "absolute", left: 20, bottom: 12, fontSize: 8.5, color: FAINT, opacity: st.rows ? 1 : 0, transition: "opacity .5s ease .6s" }}>
            Showing 6 of 21 envelopes · page 1 of 4
          </div>

          {/* Reminder toast */}
          <ToastCard
            open={st.reminder}
            title="Reminder sent"
            sub="k.werner@gusswerk-rheinland.example · NDA turn 2"
            icon={
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" /></svg>
            }
            y={14}
          />
        </div>
      </DemoCanvas>
    </div>
  );
}
