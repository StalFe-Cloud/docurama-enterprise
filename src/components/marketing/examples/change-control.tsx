"use client";

/**
 * Live example · Engineering change control.
 *
 * ECR-1042 moves through its approval chain: prepared by design, reviewed
 * by quality, approved by plant management. Each step lands with the
 * signer's identity and a timestamp, then the change is stamped approved.
 */

import { ArrowDown, Check, Factory, GitPullRequest, Layers } from "lucide-react";
import {
  DemoCanvas, DemoChrome, HeroCursor, INK, MUTED, FAINT, HAIR, SOFT, EMERALD,
  EMERALD_SOFT, RoundStamp, Spinner, btnPrimary, useExample,
} from "../demo-kit";

const W = 1000;
const H = 540;

type State = {
  in: boolean;
  arrow: boolean;
  step1: boolean;
  step2: boolean;
  approving: boolean;
  step3: boolean;
  done: boolean;
  auditChip: boolean;
  exit: boolean;
};

const INITIAL: State = {
  in: false, arrow: false, step1: false, step2: false, approving: false,
  step3: false, done: false, auditChip: false, exit: false,
};

const FINAL: State = {
  ...INITIAL, in: true, arrow: true, step1: true, step2: true, step3: true,
  done: true, auditChip: true,
};

const STEPS: { role: string; name: string; meta: string; time: string }[] = [
  { role: "PREPARED", name: "Jonas Ekberg", meta: "Design Engineering", time: "Sep 15 · 09:12" },
  { role: "REVIEWED", name: "Alexandra Fischer", meta: "Quality Management", time: "Sep 15 · 09:31" },
  { role: "APPROVAL", name: "Mats Holmgren", meta: "Plant Management", time: "Sep 15 · 09:47" },
];

export function ExampleChangeControl() {
  const { st, cursorRef, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set, cursor }) => {
      tl.at(300, () => set({ in: true }));
      tl.at(1000, () => set({ arrow: true }));
      tl.at(1000, () => set({ step1: true }));
      tl.at(1800, () => set({ step2: true }));
      tl.at(2600, () => cursor.current?.show(600, 220));
      tl.at(2720, () => cursor.current?.moveTo(890, 404));       // Approve change
      tl.at(3700, () => { cursor.current?.click(); set({ approving: true }); });
      tl.at(4850, () => set({ approving: false, step3: true }));
      tl.at(5300, () => set({ done: true }));
      tl.at(5750, () => set({ auditChip: true }));
      tl.at(6100, () => cursor.current?.hide());
      tl.at(8600, () => set({ exit: true }));
      return 9050;
    },
  });

  const doneCount = (st.step1 ? 1 : 0) + (st.step2 ? 1 : 0) + (st.step3 ? 1 : 0);

  const cardIn = {
    opacity: st.in ? 1 : 0,
    transform: st.in ? "none" : "translateY(10px)",
    transition: "opacity .4s ease, transform .5s cubic-bezier(.22,1,.36,1)",
  };

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H}
        label="Live example: engineering change request ECR-1042 for the GB-48 housing casting moves through prepare, review and approval. Every step is recorded with the signer's identity and a timestamp."
      >
        <div style={{ position: "absolute", inset: 0, background: "#fafaf9", opacity: st.exit ? 0 : 1, transition: "opacity .4s ease" }}>
          <DemoChrome url="app.docurama.eu/envelopes/DOC-6C1H9P" />

          {/* Change card */}
          <div style={{ position: "absolute", left: 24, top: 62, width: 396, height: 402, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 10, boxShadow: "0 6px 20px -12px rgba(26,26,26,.16)", ...cardIn }}>
            <div style={{ position: "absolute", left: 18, top: 16, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 28, height: 28, borderRadius: 8, background: "#eef2f8", color: "#1c3f6b", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                <GitPullRequest size={14} />
              </span>
              <span>
                <span style={{ display: "block", fontSize: 8, fontWeight: 700, letterSpacing: ".1em", color: FAINT }}>ENGINEERING CHANGE REQUEST</span>
                <span style={{ display: "block", fontSize: 11.5, fontWeight: 700, color: INK, marginTop: 1 }}>ECR-1042 · Risers and gating</span>
              </span>
            </div>
            <p style={{ position: "absolute", left: 18, top: 62, fontSize: 8.5, color: MUTED }}>
              GB-48 housing · sand casting line 2 · affects PPAP file
            </p>

            {/* Current → proposed */}
            <div style={{ position: "absolute", left: 18, right: 18, top: 86 }}>
              <div style={{ borderRadius: 8, border: `1px solid ${HAIR}`, background: SOFT, padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <span style={{ display: "block", fontSize: 7.5, fontWeight: 700, letterSpacing: ".1em", color: FAINT }}>CURRENT</span>
                  <span style={{ display: "block", fontSize: 10, color: INK, marginTop: 2 }}>2 risers · exothermic sleeve</span>
                </span>
                <span style={{ fontSize: 8.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>rev B</span>
              </div>
              <div style={{ display: "flex", justifyContent: "center", padding: "4px 0" }}>
                <span
                  style={{
                    color: EMERALD, display: "inline-flex",
                    transform: st.arrow ? "scaleY(1)" : "scaleY(.2)", opacity: st.arrow ? 1 : 0,
                    transition: "transform .35s cubic-bezier(.22,1,.36,1), opacity .3s ease",
                  }}
                >
                  <ArrowDown size={15} strokeWidth={2.4} />
                </span>
              </div>
              <div style={{ borderRadius: 8, border: `1px solid ${EMERALD}3d`, background: "#f3faf6", padding: "9px 12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span>
                  <span style={{ display: "block", fontSize: 7.5, fontWeight: 700, letterSpacing: ".1em", color: EMERALD }}>PROPOSED</span>
                  <span style={{ display: "block", fontSize: 10, color: INK, marginTop: 2 }}>3 risers · chill insert under flange</span>
                </span>
                <span style={{ fontSize: 8.5, color: EMERALD, fontFamily: "var(--font-geist-mono), monospace" }}>rev C</span>
              </div>
            </div>

            {/* Simulation result */}
            <div style={{ position: "absolute", left: 18, right: 18, top: 224, borderRadius: 8, border: `1px solid ${HAIR}`, padding: "9px 12px", display: "flex", gap: 10, alignItems: "center" }}>
              <span style={{ width: 26, height: 26, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <Factory size={12} />
              </span>
              <span style={{ fontSize: 8.5, lineHeight: 1.6, color: MUTED }}>
                Solidification sim <span style={{ color: INK, fontWeight: 600 }}>S-1188</span> · shrink porosity down 62% · casting yield up 4.1 points
              </span>
            </div>

            {/* Affected documents */}
            <div style={{ position: "absolute", left: 18, top: 288 }}>
              <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: ".1em", color: FAINT }}>AFFECTED DOCUMENTS</span>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                {["Drawing DR-2210 · rev C", "WPS-2219", "PPAP file"].map((c) => (
                  <span key={c} style={{ fontSize: 8.5, borderRadius: 6, border: `1px solid ${HAIR}`, background: "#fff", color: MUTED, padding: "3px 8px", fontFamily: "var(--font-geist-mono), monospace" }}>{c}</span>
                ))}
              </div>
            </div>

            <div style={{ position: "absolute", left: 18, right: 18, bottom: 14, paddingTop: 10, borderTop: `1px solid ${HAIR}`, display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ width: 22, height: 22, borderRadius: "50%", background: SOFT, color: MUTED, fontSize: 8, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>JE</span>
              <span style={{ fontSize: 8.5, color: FAINT }}>Initiated by Jonas Ekberg · Design Engineering</span>
            </div>
          </div>

          {/* Approval chain */}
          <div style={{ position: "absolute", left: 444, top: 62, width: 532, height: 402, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 10, boxShadow: "0 6px 20px -12px rgba(26,26,26,.16)", ...cardIn }}>
            <div style={{ position: "absolute", left: 18, top: 16, right: 18, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".1em", color: FAINT }}>APPROVAL CHAIN</span>
              <span key={doneCount} className="hero-chip-pop" style={{ fontSize: 8.5, fontWeight: 700, borderRadius: 5, padding: "2px 8px", background: doneCount === 3 ? "#d9f3e1" : SOFT, color: doneCount === 3 ? "#1a7f37" : MUTED }}>
                {doneCount} OF 3 COMPLETE
              </span>
            </div>

            {STEPS.map((s, i) => {
              const done = i === 0 ? st.step1 : i === 1 ? st.step2 : st.step3;
              const y = 52 + i * 88;
              return (
                <div key={s.role} style={{ position: "absolute", left: 18, top: y, right: 18 }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                    <span style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <span
                        className={done ? "hero-dot-in" : undefined}
                        style={{
                          width: 30, height: 30, borderRadius: "50%",
                          background: done ? "#1a7f37" : SOFT,
                          border: `2px solid ${done ? "#1a7f37" : "#d6d3ce"}`,
                          color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center",
                          transitionDelay: done ? "0ms" : "0ms",
                        }}
                      >
                        {done ? <Check size={13} strokeWidth={3.2} /> : <span style={{ fontSize: 9.5, fontWeight: 700, color: FAINT }}>{i + 1}</span>}
                      </span>
                    </span>
                    <span style={{ minWidth: 0, flex: 1 }}>
                      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                        <span style={{ fontSize: 10.5, fontWeight: 600, color: INK }}>{s.name}</span>
                        <span style={{ fontSize: 8.5, color: done ? "#1a7f37" : FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>
                          {done ? s.time : "pending"}
                        </span>
                      </span>
                      <span style={{ display: "block", fontSize: 8.5, color: FAINT, marginTop: 1 }}>
                        {s.role} · {s.meta}
                      </span>
                    </span>
                  </div>
                  {i < 2 && (
                    <span style={{ position: "absolute", left: 14.5, top: 34, width: 1.5, height: 54, background: (i === 0 ? st.step1 : st.step2) ? "#9fd8b8" : HAIR, transition: "background .4s ease" }} />
                  )}
                </div>
              );
            })}

            {/* Approve button */}
            <div style={{ position: "absolute", right: 18, bottom: 16, display: "flex", gap: 10, alignItems: "center" }}>
              {st.auditChip && (
                <span className="hero-chip-pop" style={{ fontSize: 8.5, borderRadius: 6, background: EMERALD_SOFT, color: EMERALD, fontWeight: 600, padding: "4px 9px" }}>
                  Audit entry written · evidence drawer
                </span>
              )}
              <span
                style={{
                  ...btnPrimary(),
                  width: st.done ? 150 : 142,
                  background: st.done ? "#1a7f37" : EMERALD,
                  transform: st.approving ? "scale(.965)" : "scale(1)",
                  filter: st.approving ? "brightness(.92)" : "none",
                  transition: "background .3s ease, transform .14s ease, filter .14s ease, width .2s ease",
                }}
              >
                {st.approving ? (
                  <><Spinner /><span>Recording…</span></>
                ) : st.done ? (
                  <><Check size={12} strokeWidth={3} /><span>Change approved</span></>
                ) : (
                  <><Layers size={12} strokeWidth={2.2} /><span>Approve change</span></>
                )}
              </span>
            </div>

            {/* Stamp */}
            {st.done && (
              <div style={{ position: "absolute", left: 214, top: 148 }}>
                <RoundStamp show text="APPROVED" sub="ECR-1042" size={88} color={EMERALD} />
              </div>
            )}
          </div>

          {/* Toast */}
          <div
            aria-hidden
            style={{
              position: "absolute", right: 22, bottom: 16, zIndex: 45,
              display: "flex", alignItems: "center", gap: 10,
              background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 10,
              padding: "10px 14px", boxShadow: "0 12px 32px -8px rgba(26,26,26,.24)",
              opacity: st.done ? 1 : 0,
              transform: st.done ? "translateY(0)" : "translateY(12px)",
              transition: "opacity .3s ease, transform .3s cubic-bezier(.22,1,.36,1)",
              pointerEvents: "none",
            }}
          >
            <span style={{ width: 26, height: 26, borderRadius: "50%", background: "#d9f3e1", color: "#1a7f37", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Check size={12} strokeWidth={3} />
            </span>
            <span>
              <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK }}>Change approved</span>
              <span style={{ display: "block", fontSize: 9, color: FAINT }}>M. Holmgren · Sep 15 · 09:47 CET</span>
            </span>
          </div>
        </div>
        <HeroCursor ref={cursorRef} />
      </DemoCanvas>
    </div>
  );
}
