"use client";

/**
 * Live example · CAD design approval.
 *
 * Drawing DR-2210 for the GB-48 housing draws itself: outline, bores,
 * centerlines, dimensions and the title block. The design engineer's
 * approval signature is then bound to this exact revision of the drawing.
 */

import {
  DemoCanvas, DemoChrome, HeroCursor, INK, MUTED, FAINT, HAIR, NAVY, EMERALD,
  RoundStamp, SignatureField, SIG_JONAS, useExample,
} from "../demo-kit";

const W = 1000;
const H = 540;

type State = {
  paper: boolean;
  frame: boolean;
  outline: boolean;
  bores: boolean;
  centers: boolean;
  dims: boolean;
  block: boolean;
  sigFocus: boolean;
  signing: boolean;
  signed: boolean;
  boundChip: boolean;
  exit: boolean;
};

const INITIAL: State = {
  paper: false, frame: false, outline: false, bores: false, centers: false,
  dims: false, block: false, sigFocus: false, signing: false, signed: false,
  boundChip: false, exit: false,
};

const FINAL: State = {
  ...INITIAL, paper: true, frame: true, outline: true, bores: true, centers: true,
  dims: true, block: true, sigFocus: true, signing: true, signed: true, boundChip: true,
};

/** One self-drawing path. */
function Draw({ d, on, delay, dur, sw = 1.4, dash, color = NAVY }: {
  d: string; on: boolean; delay: number; dur: number; sw?: number; dash?: string; color?: string;
}) {
  return (
    <path
      d={d}
      stroke={color}
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      fill="none"
      strokeDasharray={dash ?? 1}
      pathLength={1}
      style={{
        strokeDashoffset: on ? 0 : 1,
        opacity: on ? 1 : 0.99,
        transition: `stroke-dashoffset ${dur}ms cubic-bezier(.45,.05,.35,1) ${delay}ms`,
      }}
    />
  );
}

/** A dimension label that fades in after its line. */
function DimLabel({ x, y, text, on, delay }: { x: number; y: number; text: string; on: boolean; delay: number }) {
  return (
    <text
      x={x} y={y}
      textAnchor="middle"
      style={{
        font: '600 8px var(--font-geist-mono), monospace',
        fill: NAVY,
        opacity: on ? 1 : 0,
        transition: `opacity .3s ease ${delay}ms`,
      }}
    >
      {text}
    </text>
  );
}

export function ExampleCadApproval() {
  const { st, cursorRef, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set, cursor }) => {
      tl.at(300, () => set({ paper: true }));
      tl.at(900, () => set({ frame: true }));
      tl.at(1300, () => set({ outline: true }));
      tl.at(2050, () => set({ bores: true }));
      tl.at(2750, () => set({ centers: true }));
      tl.at(3200, () => set({ dims: true }));
      tl.at(4000, () => set({ block: true }));
      tl.at(4900, () => cursor.current?.show(520, 240));
      tl.at(5020, () => cursor.current?.moveTo(788, 428));       // APPROVED cell
      tl.at(5750, () => { cursor.current?.click(); set({ sigFocus: true }); });
      tl.at(5950, () => cursor.current?.setPen(true));
      tl.at(5980, () => set({ signing: true }));
      const wp: [number, number][] = [[752, 424], [775, 419], [798, 426], [821, 420], [838, 425]];
      wp.forEach(([x, y], i) => tl.at(6080 + i * 190, () => cursor.current?.moveTo(x, y)));
      tl.at(7080, () => cursor.current?.setPen(false));
      tl.at(7120, () => set({ signed: true }));
      tl.at(7550, () => set({ boundChip: true }));
      tl.at(7900, () => cursor.current?.hide());
      tl.at(10200, () => set({ exit: true }));
      return 10650;
    },
  });

  const fade = (on: boolean, delay: number) => ({
    opacity: on ? 1 : 0,
    transition: `opacity .35s ease ${delay}ms`,
  });

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H} minScale={0.62}
        label="Live example: engineering drawing DR-2210 for the GB-48 housing draws itself, dimensions and title block included, and the design engineer's approval signature is bound to that exact revision."
      >
        <div style={{ position: "absolute", inset: 0, background: "#fafaf9", opacity: st.exit ? 0 : 1, transition: "opacity .4s ease" }}>
          <DemoChrome url="app.docurama.eu/sign/dr-2210-C" />

          {/* Paper */}
          <div style={{ position: "absolute", left: 150, top: 58, width: 700, height: 442 }}>
            <div style={{ position: "absolute", inset: 0, transform: "translate(4px,4px) rotate(.3deg)", background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6 }} />
            <div
              style={{
                position: "absolute", inset: 0, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6,
                boxShadow: "0 8px 24px -12px rgba(26,26,26,.18)",
                opacity: st.paper ? 1 : 0,
                transform: st.paper ? "none" : "translateY(10px) scale(.99)",
                transition: "opacity .4s ease, transform .5s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {/* Sheet frame */}
              <svg width={700} height={442} viewBox="0 0 700 442" fill="none" style={{ position: "absolute", inset: 0 }}>
                <Draw d="M 12 12 H 688 V 430 H 12 Z" on={st.frame} delay={0} dur={520} sw={1.1} />
                {/* Part outline: plate + flange */}
                <Draw d="M 150 120 H 370 Q 382 120 382 132 V 228 Q 382 240 370 240 H 150 Q 138 240 138 228 V 132 Q 138 120 150 120 Z" on={st.outline} delay={0} dur={560} />
                <Draw d="M 118 240 H 402 V 268 H 118 Z" on={st.outline} delay={320} dur={280} />
                {/* Central bore + keyway */}
                <Draw d="M 260 146 A 34 34 0 1 1 259.9 146 Z" on={st.bores} delay={0} dur={380} />
                <Draw d="M 252 108 H 268 V 116 H 252 Z" on={st.bores} delay={260} dur={140} />
                {/* Bolt holes */}
                <Draw d="M 168 142 A 9 9 0 1 1 167.9 142 Z" on={st.bores} delay={340} dur={170} />
                <Draw d="M 342 142 A 9 9 0 1 1 341.9 142 Z" on={st.bores} delay={460} dur={170} />
                <Draw d="M 168 214 A 9 9 0 1 1 167.9 214 Z" on={st.bores} delay={580} dur={170} />
                <Draw d="M 342 214 A 9 9 0 1 1 341.9 214 Z" on={st.bores} delay={700} dur={170} />
                {/* Centerlines */}
                <Draw d="M 118 180 H 402" on={st.centers} delay={0} dur={340} sw={0.8} dash="7 5" color={FAINT} />
                <Draw d="M 260 92 V 296" on={st.centers} delay={120} dur={280} sw={0.8} dash="7 5" color={FAINT} />
                {/* Dimension: width */}
                <Draw d="M 138 292 V 304 M 402 292 V 304 M 138 298 H 402" on={st.dims} delay={0} dur={380} sw={0.9} />
                {/* Dimension: height */}
                <Draw d="M 96 120 H 108 M 96 240 H 108 M 102 120 V 240" on={st.dims} delay={200} dur={320} sw={0.9} />
                {/* Leader: bore */}
                <Draw d="M 288 156 L 330 92" on={st.dims} delay={420} dur={220} sw={0.9} />
                {/* Fillet note leader */}
                <Draw d="M 150 240 L 118 286" on={st.dims} delay={560} dur={180} sw={0.9} />
                <DimLabel x={270} y={318} text="120" on={st.dims} delay={180} />
                <DimLabel x={86} y={184} text="86" on={st.dims} delay={380} />
                <DimLabel x={352} y={86} text="Ø42 H7" on={st.dims} delay={520} />
                <DimLabel x={132} y={304} text="R8" on={st.dims} delay={660} />
              </svg>

              {/* Bolt-hole note */}
              <div style={{ position: "absolute", left: 452, top: 132, ...fade(st.dims, 620) }}>
                <p style={{ fontSize: 8.5, fontWeight: 700, color: NAVY, fontFamily: "var(--font-geist-mono), monospace" }}>4× Ø14</p>
                <p style={{ fontSize: 7.5, color: MUTED, fontFamily: "var(--font-geist-mono), monospace", marginTop: 1 }}>THRU · C'bore Ø22</p>
              </div>

              {/* Material note */}
              <div style={{ position: "absolute", left: 452, top: 196, ...fade(st.dims, 760) }}>
                <p style={{ fontSize: 8.5, fontWeight: 700, color: NAVY, fontFamily: "var(--font-geist-mono), monospace" }}>EN-GJL-250</p>
                <p style={{ fontSize: 7.5, color: MUTED, fontFamily: "var(--font-geist-mono), monospace", marginTop: 1 }}>ISO 8062 · CT12</p>
              </div>

              {/* Title block */}
              <div
                style={{
                  position: "absolute", right: 16, bottom: 16, width: 316,
                  border: `1.2px solid ${NAVY}`, background: "#fff",
                  display: "grid", gridTemplateColumns: "88px 1fr",
                  opacity: st.block ? 1 : 0, transform: st.block ? "none" : "translateY(6px)",
                  transition: "opacity .4s ease, transform .4s cubic-bezier(.22,1,.36,1)",
                }}
              >
                {[
                  ["TITLE", "GB-48 HOUSING · CASTING", 0],
                  ["DWG NO.", "DR-2210 · SHEET 1/3", 90],
                  ["DRAWN", "J. EKBERG · 2026-09-12", 180],
                  ["CHECKED", "A. FISCHER · 2026-09-14", 270],
                ].map(([k, v, d]) => (
                  <div key={k as string} style={{ display: "contents" }}>
                    <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: ".08em", color: NAVY, padding: "5px 7px", borderRight: `1px solid ${NAVY}55`, borderBottom: `1px solid ${NAVY}55`, ...fade(st.block, d as number) }}>{k as string}</span>
                    <span style={{ fontSize: 8, color: INK, padding: "5px 8px", borderBottom: `1px solid ${NAVY}55`, fontFamily: "var(--font-geist-mono), monospace", ...fade(st.block, (d as number) + 40) }}>{v as string}</span>
                  </div>
                ))}
                <span style={{ fontSize: 7, fontWeight: 700, letterSpacing: ".08em", color: NAVY, padding: "5px 7px", borderRight: `1px solid ${NAVY}55`, ...fade(st.block, 360) }}>APPROVED</span>
                <div style={{ padding: "3px 8px", display: "flex", alignItems: "center", gap: 8, ...fade(st.block, 400) }}>
                  <SignatureField w={128} h={36} strokes={SIG_JONAS} drawing={st.signing} />
                  <span>
                    <span style={{ display: "block", fontSize: 7, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>SCALE 1:2</span>
                    <span style={{ display: "block", fontSize: 7, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>REV C</span>
                  </span>
                </div>
              </div>

              {/* Bound chip */}
              {st.boundChip && (
                <div
                  className="hero-chip-pop"
                  style={{
                    position: "absolute", left: 16, bottom: 16,
                    fontSize: 8.5, borderRadius: 7, background: "#dff3eb", color: EMERALD,
                    fontWeight: 600, padding: "5px 10px",
                    display: "flex", alignItems: "center", gap: 6,
                  }}
                >
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={EMERALD} strokeWidth="3"><path d="M20 6 9 17l-5-5" /></svg>
                  Signature bound to DR-2210 · rev C
                </div>
              )}

              {/* Stamp on the clear upper-left of the sheet, over the frame
                  border the way a real drawing approval stamp lands */}
              {st.signed && (
                <div style={{ position: "absolute", left: 126, top: 34 }}>
                  <RoundStamp show text="APPROVED" sub="DR-2210 · C" size={84} color={NAVY} />
                </div>
              )}
            </div>
          </div>

          {/* Strip */}
          <div style={{ position: "absolute", left: 20, top: 46, fontSize: 10.5, color: MUTED }}>
            Signing <span style={{ color: INK, fontWeight: 600 }}>Drawing Approval DR-2210 · GB-48 Housing</span>
          </div>
          <div style={{ position: "absolute", right: 20, top: 46, fontSize: 10, color: FAINT }}>
            Signer 1 of 1 · Jonas Ekberg · Design Engineering
          </div>
        </div>
        <HeroCursor ref={cursorRef} />
      </DemoCanvas>
    </div>
  );
}
