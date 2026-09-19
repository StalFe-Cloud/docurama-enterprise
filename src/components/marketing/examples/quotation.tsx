"use client";

/**
 * Live example · Quotation.
 *
 * Elisa Righi at Fonderia Padana approves quotation QT-2026-114 for cast
 * housings: the price table lands, the total is checked, the approval
 * signature is drawn, and the quotation is sealed to both parties.
 */

import { Check, PenLine } from "lucide-react";
import {
  DemoCanvas, DemoChrome, HeroCursor, INK, MUTED, FAINT, HAIR, SOFT, EMERALD,
  RoundStamp, SignatureField, SIG_ELISA, Spinner, StalfeLetterhead, ToastCard,
  btnPrimary, useExample,
} from "../demo-kit";

const W = 1000;
const H = 540;

type State = {
  paper: boolean;
  rows: boolean;
  totalHit: boolean;
  sigFocus: boolean;
  signing: boolean;
  adoptReady: boolean;
  adopting: boolean;
  signed: boolean;
  toast: boolean;
  exit: boolean;
};

const INITIAL: State = {
  paper: false, rows: false, totalHit: false, sigFocus: false, signing: false,
  adoptReady: false, adopting: false, signed: false, toast: false, exit: false,
};

const FINAL: State = {
  ...INITIAL, paper: true, rows: true, totalHit: true, signing: true,
  adoptReady: true, signed: true, toast: true,
};

const ITEMS: [string, string, string, string][] = [
  ["1", "GB-48 housing, as-cast · EN-GJL-250", "120", "€18.40"],
  ["2", "GB-48 cover plate, machined", "120", "€6.90"],
  ["3", "Pattern maintenance, one-off", "1", "€240.00"],
];

export function ExampleQuotation() {
  const { st, cursorRef, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set, cursor }) => {
      tl.at(300, () => set({ paper: true }));
      tl.at(900, () => set({ rows: true }));
      tl.at(1700, () => cursor.current?.show(560, 210));
      tl.at(1850, () => cursor.current?.moveTo(700, 300));        // total row
      tl.at(2550, () => { cursor.current?.click(); set({ totalHit: true }); });
      tl.at(3000, () => cursor.current?.moveTo(735, 424));        // signature field
      tl.at(3650, () => { cursor.current?.click(); set({ sigFocus: true }); });
      tl.at(3850, () => cursor.current?.setPen(true));
      tl.at(3900, () => set({ signing: true }));
      const wp: [number, number][] = [[668, 420], [698, 414], [728, 422], [758, 416], [788, 424], [802, 420]];
      wp.forEach(([x, y], i) => tl.at(3990 + i * 205, () => cursor.current?.moveTo(x, y)));
      tl.at(5100, () => cursor.current?.setPen(false));
      tl.at(5130, () => set({ adoptReady: true }));
      tl.at(5330, () => cursor.current?.moveTo(902, 509));        // Approve and sign
      tl.at(6050, () => { cursor.current?.click(); set({ adopting: true }); });
      tl.at(7250, () => set({ adopting: false, signed: true, toast: true }));
      tl.at(7700, () => cursor.current?.hide());
      tl.at(10100, () => set({ exit: true }));
      return 10550;
    },
  });

  const exitStyle = { opacity: st.exit ? 0 : 1, transition: "opacity .4s ease" };

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H}
        label="Live example: Elisa Righi at Fonderia Padana approves a cast housing quotation from StålFe. The total is checked, the approval signature is drawn, and the sealed copy goes to both parties."
      >
        <div style={{ position: "absolute", inset: 0, background: "#fafaf9" }}>
          <DemoChrome url="app.docurama.eu/sign/9f2c-71kd" />

          {/* Signer strip */}
          <div style={{ position: "absolute", left: 24, top: 46, fontSize: 10.5, color: MUTED }}>
            Signing <span style={{ color: INK, fontWeight: 600 }}>Quotation QT-2026-114 · Cast Housings</span>
          </div>
          <div style={{ position: "absolute", right: 24, top: 46, fontSize: 10, color: FAINT }}>
            Signer 1 of 1 · Elisa Righi · Fonderia Padana
          </div>

          {/* Left summary rail */}
          <div
            style={{
              position: "absolute", left: 24, top: 84, width: 246, height: 396,
              background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 8,
              boxShadow: "0 8px 24px -12px rgba(26,26,26,.18)",
              display: "flex", flexDirection: "column",
              padding: "16px 16px",
              opacity: st.exit ? 0 : (st.paper ? 1 : 0),
              transform: st.paper ? "none" : "translateY(10px) scale(.99)",
              transition: st.exit ? "opacity .4s ease" : "opacity .4s ease, transform .5s cubic-bezier(.22,1,.36,1)",
            }}
          >
            {/* Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".1em", color: FAINT }}>QUOTATION</span>
              <span
                style={{
                  fontSize: 8.5, fontWeight: 700, borderRadius: 5, padding: "2px 7px",
                  background: st.signed ? "#d9f3e1" : "#dcecfa",
                  color: st.signed ? "#1a7f37" : "#0075de",
                  transition: "background .3s ease, color .3s ease",
                }}
              >
                {st.signed ? "APPROVED" : "PENDING"}
              </span>
            </div>

            {/* Title */}
            <div style={{ marginTop: 12 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: INK }}>QT-2026-114 · REV B</p>
              <p style={{ fontSize: 8.5, color: MUTED, marginTop: 2 }}>Cast housings · GB-48 frame</p>
            </div>

            <div style={{ height: 1, background: HAIR, margin: "14px 0" }} />

            {/* Customer */}
            <div>
              <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", color: FAINT }}>CUSTOMER</span>
              <p style={{ fontSize: 9.5, fontWeight: 600, color: INK, marginTop: 2 }}>Fonderia Padana S.p.A.</p>
              <p style={{ fontSize: 8, color: MUTED }}>Reggio Emilia · Italy</p>
            </div>

            {/* Signer */}
            <div style={{ marginTop: 12 }}>
              <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", color: FAINT }}>SIGNER</span>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                <span style={{ width: 24, height: 24, borderRadius: "50%", background: "#dceaf8", color: "#1c3f6b", fontSize: 9.5, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  ER
                </span>
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 9.5, fontWeight: 600, color: INK, lineHeight: 1.2 }}>Elisa Righi</p>
                  <p style={{ fontSize: 8, color: FAINT, lineHeight: 1.2 }}>Procurement Lead</p>
                </div>
              </div>
            </div>

            {/* Total box */}
            <div style={{ marginTop: 14, padding: "8px 10px", borderRadius: 6, background: SOFT, border: `1px solid ${HAIR}` }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".06em", color: FAINT }}>TOTAL EXCL. VAT</span>
                <span style={{ fontSize: 11, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>€3,036.00</span>
              </div>
              <p style={{ fontSize: 7.5, color: FAINT, marginTop: 2 }}>3 line items · 241 units</p>
            </div>

            {/* Compliance footer */}
            <div style={{ marginTop: "auto", paddingTop: 10, borderTop: `1px solid ${HAIR}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke={EMERALD} strokeWidth="2.5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                <span style={{ fontSize: 8, fontWeight: 600, color: EMERALD }}>eIDAS-aligned · PAdES</span>
              </div>
              <p style={{ fontSize: 7.5, color: FAINT, marginTop: 3, lineHeight: 1.4 }}>
                Qualified timestamp and SHA-256 seal upon approval.
              </p>
            </div>
          </div>

          {/* Paper stack */}
          <div style={{ position: "absolute", left: 290, top: 84, width: 560, height: 396, ...exitStyle }}>
            <div style={{ position: "absolute", inset: 0, transform: "translate(4px,4px) rotate(.35deg)", background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6 }} />
            <div style={{ position: "absolute", inset: 0, transform: "translate(2px,2px) rotate(.15deg)", background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6 }} />
            <div
              style={{
                position: "absolute", inset: 0, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6,
                boxShadow: "0 8px 24px -12px rgba(26,26,26,.18)",
                opacity: st.paper ? 1 : 0,
                transform: st.paper ? "none" : "translateY(10px) scale(.99)",
                transition: "opacity .4s ease, transform .5s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {/* Letterhead */}
              <div style={{ position: "absolute", left: 20, top: 16 }}>
                <StalfeLetterhead />
              </div>
              <div style={{ position: "absolute", right: 20, top: 18, textAlign: "right" }}>
                <span style={{ display: "block", fontSize: 11, fontWeight: 700, letterSpacing: ".12em", color: INK }}>QUOTATION</span>
                <span style={{ display: "block", fontSize: 8, color: FAINT, fontFamily: "var(--font-geist-mono), monospace", marginTop: 2 }}>QT-2026-114 · REV B</span>
              </div>

              <div style={{ position: "absolute", left: 20, top: 62 }}>
                <p style={{ fontSize: 9.5, color: INK, fontWeight: 600 }}>Prepared for Fonderia Padana S.p.A. · Reggio Emilia</p>
                <p style={{ fontSize: 8.5, color: MUTED, marginTop: 2 }}>In response to RFQ-2026-0417 · Valid 30 days · Incoterms DAP</p>
              </div>

              {/* Items table */}
              <div style={{ position: "absolute", left: 20, right: 20, top: 100 }}>
                <div style={{ display: "grid", gridTemplateColumns: "26px 1fr 44px 66px", padding: "0 8px 5px", borderBottom: `1px solid ${HAIR}` }}>
                  {["POS", "DESCRIPTION", "QTY", "UNIT"].map((h) => (
                    <span key={h} style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", color: FAINT, textAlign: h === "UNIT" || h === "QTY" ? "right" : "left" }}>{h}</span>
                  ))}
                </div>
                {ITEMS.map((row, i) => (
                  <div
                    key={row[0]}
                    style={{
                      display: "grid", gridTemplateColumns: "26px 1fr 44px 66px", padding: "6.5px 8px",
                      borderBottom: `1px solid #f0eeec`,
                      opacity: st.rows ? 1 : 0,
                      transform: st.rows ? "none" : "translateY(6px)",
                      transition: `opacity .35s ease ${(i * 120).toString()}ms, transform .35s cubic-bezier(.22,1,.36,1) ${(i * 120).toString()}ms`,
                    }}
                  >
                    <span style={{ fontSize: 9, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>{row[0]}</span>
                    <span style={{ fontSize: 9.5, color: INK }}>{row[1]}</span>
                    <span style={{ fontSize: 9.5, color: MUTED, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row[2]}</span>
                    <span style={{ fontSize: 9.5, color: INK, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{row[3]}</span>
                  </div>
                ))}
                {/* Total */}
                <div
                  style={{
                    display: "flex", justifyContent: "space-between", alignItems: "center",
                    padding: "7px 8px", marginTop: 6, borderRadius: 7,
                    background: st.totalHit ? "#eef7f2" : "transparent",
                    border: st.totalHit ? `1px solid ${EMERALD}33` : "1px solid transparent",
                    transition: "background .3s ease, border-color .3s ease",
                  }}
                >
                  <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".06em", color: st.totalHit ? EMERALD : MUTED }}>TOTAL · EXCL. VAT</span>
                  <span style={{ fontSize: 12, fontWeight: 700, color: INK, fontVariantNumeric: "tabular-nums" }}>€3,036.00</span>
                </div>
              </div>

              <p style={{ position: "absolute", left: 20, top: 262, fontSize: 8, color: FAINT, width: 300, lineHeight: 1.6 }}>
                Casting tolerances ISO 8062-CT12. Material certificate EN 10204 3.1 included with each heat.
              </p>

              {/* Date + signature block */}
              <div style={{ position: "absolute", left: 20, top: 306, fontSize: 7.5, color: FAINT, letterSpacing: ".06em" }}>DATE</div>
              <div style={{ position: "absolute", left: 20, top: 316, fontSize: 9.5, color: INK, fontFamily: "var(--font-geist-mono), monospace" }}>2026-09-15</div>
              <div style={{ position: "absolute", right: 20, top: 306, fontSize: 7.5, color: FAINT, letterSpacing: ".06em", textAlign: "right" }}>
                APPROVAL · E. RIGHI · FONDERIA PADANA
              </div>
              <div style={{ position: "absolute", right: 20, top: 316 }}>
                <SignatureField w={190} h={56} strokes={SIG_ELISA} drawing={st.signing} />
              </div>

              {/* Approved stamp */}
              {st.signed && (
                <div style={{ position: "absolute", left: 96, top: 130 }}>
                  <RoundStamp show text="APPROVED" sub="QT-2026-114" size={86} />
                </div>
              )}
            </div>
          </div>

          {/* Signing bar */}
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 62, background: "#fff", borderTop: `1px solid ${HAIR}`, display: "flex", alignItems: "center", paddingLeft: 20, paddingRight: 16, gap: 10, ...exitStyle }}>
            <span style={{ width: 28, height: 28, borderRadius: "50%", background: "#dceaf8", color: "#1c3f6b", fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>ER</span>
            <span>
              <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: INK }}>Signing as Elisa Righi</span>
              <span style={{ display: "block", fontSize: 9, color: FAINT }}>elisa.righi@fonderia-padana.example · identity verified by unique signing link</span>
            </span>
            <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ fontSize: 11, color: MUTED, opacity: st.signed ? 0 : 1, transition: "opacity .2s ease" }}>Decline</span>
              <span
                style={{
                  ...btnPrimary(),
                  width: st.adopting ? 118 : st.signed ? 134 : 148,
                  background: st.signed ? "#1a7f37" : st.adoptReady ? EMERALD : "#b9c9c2",
                  transform: st.adopting ? "scale(.965)" : "scale(1)",
                  transition: "background .3s ease, width .2s ease, transform .14s ease",
                }}
              >
                {st.adopting ? (
                  <><Spinner /><span>Sealing…</span></>
                ) : st.signed ? (
                  <><Check size={13} strokeWidth={2.4} /><span>Approved & sealed</span></>
                ) : (
                  <><PenLine size={12} strokeWidth={2.2} /><span>Approve and sign</span></>
                )}
              </span>
            </span>
          </div>

          {/* Toast */}
          <ToastCard
            open={st.toast}
            title="Quotation approved"
            sub="Sealed copy delivered to both parties"
            y={76}
          />
        </div>
        <HeroCursor ref={cursorRef} />
      </DemoCanvas>
    </div>
  );
}
