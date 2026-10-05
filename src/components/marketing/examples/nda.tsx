"use client";

/**
 * Live example · Mutual NDA.
 *
 * A mutual NDA between StålFe and Gusswerk Rheinland routes through two
 * signers in strict order: StålFe signs first, the turn passes to Gusswerk,
 * and only then does the envelope complete and seal.
 */

import { PenLine, UserRound } from "lucide-react";
import {
  Bar, DemoCanvas, DemoChrome, DemoChip, HeroCursor, INK, MUTED, FAINT, HAIR,
  SOFT, EMERALD, EMERALD_SOFT, RoundStamp, SignatureField, SIG_ALEX, SIG_KLAUS,
  StalfeLetterhead, ToastCard, useExample,
} from "../demo-kit";

const W = 1000;
const H = 540;

type State = {
  in: boolean;
  step1Active: boolean;
  drawA: boolean;
  step1Done: boolean;
  lineFill: boolean;
  step2Active: boolean;
  drawB: boolean;
  step2Done: boolean;
  completed: boolean;
  toastA: boolean;
  toastB: boolean;
  exit: boolean;
};

const INITIAL: State = {
  in: false, step1Active: false, drawA: false, step1Done: false, lineFill: false,
  step2Active: false, drawB: false, step2Done: false, completed: false,
  toastA: false, toastB: false, exit: false,
};

const FINAL: State = {
  ...INITIAL, in: true, step1Done: true, drawA: true, lineFill: true,
  step2Done: true, drawB: true, completed: true,
};

export function ExampleNda() {
  const { st, cursorRef, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set, cursor }) => {
      tl.at(300, () => set({ in: true }));
      tl.at(1100, () => set({ step1Active: true }));
      tl.at(1500, () => cursor.current?.show(520, 180));
      tl.at(1620, () => cursor.current?.moveTo(408, 380));       // block A
      tl.at(2350, () => cursor.current?.click());
      tl.at(2530, () => cursor.current?.setPen(true));
      tl.at(2560, () => set({ drawA: true }));
      const wpA: [number, number][] = [[362, 380], [396, 374], [430, 382], [464, 376], [496, 384]];
      wpA.forEach(([x, y], i) => tl.at(2650 + i * 215, () => cursor.current?.moveTo(x, y)));
      tl.at(3820, () => cursor.current?.setPen(false));
      tl.at(3950, () => set({ step1Done: true, toastA: true }));
      tl.at(4550, () => set({ toastA: false }));
      tl.at(4750, () => set({ lineFill: true, step2Active: true, toastB: true }));
      tl.at(5450, () => set({ toastB: false }));
      tl.at(5600, () => cursor.current?.moveTo(856, 380));       // block B
      tl.at(6350, () => cursor.current?.click());
      tl.at(6530, () => cursor.current?.setPen(true));
      tl.at(6560, () => set({ drawB: true }));
      const wpB: [number, number][] = [[810, 380], [844, 374], [878, 382], [912, 376], [944, 384]];
      wpB.forEach(([x, y], i) => tl.at(6650 + i * 215, () => cursor.current?.moveTo(x, y)));
      tl.at(7820, () => cursor.current?.setPen(false));
      tl.at(7950, () => set({ step2Done: true }));
      tl.at(8350, () => set({ completed: true }));
      tl.at(8800, () => cursor.current?.hide());
      tl.at(10900, () => set({ exit: true }));
      return 11350;
    },
  });

  const cardIn = {
    opacity: st.in ? 1 : 0,
    transform: st.in ? "none" : "translateY(10px)",
    transition: "opacity .4s ease, transform .5s cubic-bezier(.22,1,.36,1)",
  };

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H}
        label="Illustrative example with synthetic values: a mutual NDA between StålFe and Gusswerk Rheinland routes through two signers in order. StålFe signs first, the turn passes to Gusswerk, and the envelope completes when both parties have signed."
      >
        <div style={{ position: "absolute", inset: 0, background: "#fafaf9" }}>
          <DemoChrome url="app.docurama.eu/documents/DOC-2M4T8K" />

          {/* Routing rail */}
          <div style={{ position: "absolute", left: 24, top: 76, width: 240, height: 400, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 10, boxShadow: "0 6px 20px -12px rgba(26,26,26,.16)", ...cardIn }}>
            <div style={{ position: "absolute", left: 16, top: 14, display: "flex", alignItems: "center", justifyContent: "space-between", right: 16 }}>
              <span style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".1em", color: FAINT }}>ROUTING ORDER</span>
              <span key={st.completed ? "c" : "p"} style={{ fontSize: 8.5, fontWeight: 700, borderRadius: 5, padding: "2px 7px", background: st.completed ? "#d9f3e1" : "#dcecfa", color: st.completed ? "#1a7f37" : "#0075de" }}>
                {st.completed ? "COMPLETED" : "IN PROGRESS"}
              </span>
            </div>

            {/* Step 1 */}
            <div style={{ position: "absolute", left: 16, top: 52, width: 208 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span
                  style={{
                    position: "relative", width: 36, height: 36, borderRadius: "50%",
                    background: EMERALD_SOFT, color: EMERALD, fontSize: 11, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    boxShadow: st.step1Active && !st.step1Done ? "0 0 0 4px rgba(15,122,90,.15)" : "none",
                    transition: "box-shadow .3s ease",
                  }}
                >
                  AF
                  {st.step1Done && (
                    <span className="hero-chip-pop" style={{ position: "absolute", right: -3, bottom: -3, width: 14, height: 14, borderRadius: "50%", background: "#1a7f37", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK }}>Alexandra Fischer</span>
                  <span style={{ display: "block", fontSize: 8.5, color: FAINT }}>StålFe AB · Quality Manager</span>
                </span>
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 8.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>SIGNS 1 · SIMPLE ES</span>
                {st.step1Done ? <DemoChip status="SIGNED" pop="s1" /> : <span style={{ fontSize: 9, color: st.step1Active ? EMERALD : FAINT, fontWeight: 600 }}>{st.step1Active ? "Signing…" : "Waiting"}</span>}
              </div>
            </div>

            {/* Connector */}
            <div style={{ position: "absolute", left: 33, top: 132, width: 2, height: 66, background: HAIR, borderRadius: 2, overflow: "hidden" }}>
              <span style={{ position: "absolute", inset: 0, background: EMERALD, transform: `scaleY(${st.lineFill ? 1 : 0})`, transformOrigin: "top", transition: "transform .5s cubic-bezier(.22,1,.36,1)" }} />
            </div>

            {/* Step 2 */}
            <div style={{ position: "absolute", left: 16, top: 210, width: 208 }}>
              <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                <span
                  style={{
                    position: "relative", width: 36, height: 36, borderRadius: "50%",
                    background: st.step2Done ? "#d9f3e1" : "#eef2f8", color: st.step2Done ? "#1a7f37" : "#1c3f6b",
                    fontSize: 11, fontWeight: 700,
                    display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                    boxShadow: st.step2Active && !st.step2Done ? "0 0 0 4px rgba(15,122,90,.15)" : "none",
                    transition: "box-shadow .3s ease, background .3s ease, color .3s ease",
                  }}
                >
                  KW
                  {st.step2Done && (
                    <span className="hero-chip-pop" style={{ position: "absolute", right: -3, bottom: -3, width: 14, height: 14, borderRadius: "50%", background: "#1a7f37", color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", border: "2px solid #fff" }}>
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M20 6 9 17l-5-5" /></svg>
                    </span>
                  )}
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK }}>Klaus Werner</span>
                  <span style={{ display: "block", fontSize: 8.5, color: FAINT }}>Gusswerk Rheinland GmbH · Procurement</span>
                </span>
              </div>
              <div style={{ marginTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontSize: 8.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>SIGNS 2 · AFTER 1</span>
                {st.step2Done ? <DemoChip status="SIGNED" pop="s2" /> : <span style={{ fontSize: 9, color: st.step2Active ? EMERALD : FAINT, fontWeight: 600 }}>{st.step2Active ? "Signing…" : "Waiting"}</span>}
              </div>
            </div>

            <div style={{ position: "absolute", left: 16, right: 16, bottom: 14, paddingTop: 12, borderTop: `1px solid ${HAIR}`, display: "flex", gap: 8, alignItems: "flex-start" }}>
              <UserRound size={12} color={FAINT} style={{ flexShrink: 0, marginTop: 1 }} />
              <span style={{ fontSize: 8.5, lineHeight: 1.6, color: FAINT }}>
                The envelope completes only when both parties have signed. Each turn is delivered by a personal link.
              </span>
            </div>
          </div>

          {/* The agreement */}
          <div style={{ position: "absolute", left: 288, top: 76, width: 688, height: 400, ...cardIn }}>
            <div style={{ position: "absolute", inset: 0, transform: "translate(4px,4px) rotate(.3deg)", background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6 }} />
            <div style={{ position: "absolute", inset: 0, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6, boxShadow: "0 8px 24px -12px rgba(26,26,26,.18)" }}>
              <div style={{ position: "absolute", left: 20, top: 14 }}>
                <StalfeLetterhead compact />
              </div>
              <div style={{ position: "absolute", right: 20, top: 18, fontSize: 8, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>MUTUAL NDA · 6 PAGES</div>

              <p style={{ position: "absolute", left: 0, right: 0, top: 58, textAlign: "center", fontSize: 12, fontWeight: 700, letterSpacing: ".06em", color: INK }}>
                MUTUAL NON-DISCLOSURE AGREEMENT
              </p>
              <p style={{ position: "absolute", left: 0, right: 0, top: 74, textAlign: "center", fontSize: 8.5, color: MUTED }}>
                between StålFe AB and Gusswerk Rheinland GmbH
              </p>

              {/* Clause skeleton */}
              <div style={{ position: "absolute", left: 20, right: 20, top: 98, display: "grid", gap: 9 }}>
                <Bar w={480} /><Bar w={430} /><Bar w={465} o={0.85} /><Bar w={300} o={0.7} />
              </div>

              {/* Highlighted term clause */}
              <div
                style={{
                  position: "absolute", left: 20, right: 20, top: 156, borderRadius: 7,
                  background: "#f3faf6", border: `1px solid ${EMERALD}2e`, borderLeft: `3px solid ${EMERALD}`,
                  padding: "8px 12px",
                  opacity: st.in ? 1 : 0, transform: st.in ? "none" : "translateY(6px)",
                  transition: "opacity .4s ease .5s, transform .4s cubic-bezier(.22,1,.36,1) .5s",
                }}
              >
                <p style={{ fontSize: 9.5, fontWeight: 700, color: INK }}>7. Term</p>
                <p style={{ fontSize: 8.5, lineHeight: 1.65, color: MUTED, marginTop: 2 }}>
                  This Agreement remains in force for three (3) years from the Effective Date. Confidential
                  information exchanged under it stays protected after expiry for a further two (2) years.
                </p>
              </div>

              <div style={{ position: "absolute", left: 20, right: 20, top: 222, display: "grid", gap: 9 }}>
                <Bar w={470} o={0.85} /><Bar w={410} o={0.7} />
              </div>

              {/* Signature blocks */}
              <div style={{ position: "absolute", left: 20, top: 274, fontSize: 7.5, color: FAINT, letterSpacing: ".06em" }}>
                FOR STÅLFE AB · A. FISCHER
              </div>
              <div style={{ position: "absolute", left: 20, top: 286 }}>
                <SignatureField w={200} h={54} strokes={SIG_ALEX} drawing={st.drawA} />
              </div>
              <div style={{ position: "absolute", left: 20, top: 348, fontSize: 8, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>
                {st.step1Done ? "Signed Sep 15 · 08:12 CET" : "Awaiting signature"}
              </div>

              <div style={{ position: "absolute", right: 20, top: 274, fontSize: 7.5, color: FAINT, letterSpacing: ".06em", textAlign: "right" }}>
                FOR GUSSWERK RHEINLAND GMBH · K. WERNER
              </div>
              <div style={{ position: "absolute", right: 20, top: 286 }}>
                <SignatureField w={200} h={54} strokes={SIG_KLAUS} drawing={st.drawB} />
              </div>
              <div style={{ position: "absolute", right: 20, top: 348, fontSize: 8, color: FAINT, fontFamily: "var(--font-geist-mono), monospace", textAlign: "right" }}>
                {st.step2Done ? "Signed Sep 15 · 08:19 CET" : "Waiting for turn 1"}
              </div>

              {/* Completion stamp in the gutter between blocks */}
              {st.completed && (
                <div style={{ position: "absolute", left: 300, top: 268 }}>
                  <RoundStamp show text="COMPLETED" sub="EMAIL LINK" size={82} />
                </div>
              )}
            </div>
          </div>

          {/* Exit fade */}
          <div style={{ position: "absolute", inset: 0, background: "#fafaf9", opacity: st.exit ? 1 : 0, transition: "opacity .4s ease", pointerEvents: "none" }} />

          <ToastCard open={st.toastA} title="Signature captured" sub="Alexandra Fischer · turn 1 of 2" icon={<PenLine size={12} />} />
          <ToastCard open={st.toastB} title="Turn passed to Klaus Werner" sub="k.werner@gusswerk-rheinland.example · personal link sent" />
        </div>
        <HeroCursor ref={cursorRef} />
      </DemoCanvas>
    </div>
  );
}
