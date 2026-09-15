"use client";

/**
 * Live example · Supply agreement from a template.
 *
 * The annual supply agreement is a template in the StålFe workspace. One
 * click opens a prefilled envelope (title, both signers, routing), it is
 * sent, both parties sign in sequence, and the sealed copy carries a public
 * verification code.
 */

import { FileSignature, LayoutTemplate, Send } from "lucide-react";
import {
  Bar, DemoCanvas, DemoChrome, DemoChip, HeroCursor, INK, MUTED, FAINT, HAIR,
  SOFT, WORKSPACE, EMERALD, EMERALD_SOFT, RoundStamp, Spinner, ToastCard,
  btnPrimary, useExample,
} from "../demo-kit";

const W = 1000;
const H = 540;

const HASH = "6b1e94d0f7c2a8e5b3d9";

type State = {
  scene: "a" | "b" | "c";
  in: boolean;
  press: boolean;
  prefilled: boolean;
  sending: boolean;
  sent: boolean;
  rowIn: boolean;
  half: boolean;
  full: boolean;
  digest: string;
  sealed: boolean;
  toast: boolean;
  exit: boolean;
};

const INITIAL: State = {
  scene: "a", in: false, press: false, prefilled: false, sending: false,
  sent: false, rowIn: false, half: false, full: false, digest: "",
  sealed: false, toast: false, exit: false,
};

const FINAL: State = {
  ...INITIAL, scene: "c", in: true, rowIn: true, full: true,
  digest: HASH, sealed: true,
};

export function ExampleSupplyAgreement() {
  const { st, cursorRef, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set, cursor }) => {
      tl.at(300, () => set({ in: true }));
      tl.at(1400, () => cursor.current?.show(320, 240));
      tl.at(1550, () => cursor.current?.moveTo(330, 388));       // Use template
      tl.at(2450, () => { cursor.current?.click(); set({ press: true }); });
      tl.at(2650, () => set({ press: false }));
      tl.at(2750, () => set({ scene: "b" }));
      tl.at(3300, () => set({ prefilled: true }));               // sweep over the prefilled fields
      tl.at(3900, () => cursor.current?.moveTo(852, 344));       // Send
      tl.at(4800, () => { cursor.current?.click(); set({ sending: true }); });
      tl.at(5700, () => set({ sending: false, scene: "c", sent: true }));
      tl.at(6100, () => set({ rowIn: true }));
      tl.at(6900, () => set({ half: true }));
      tl.at(7700, () => set({ full: true }));
      const hashEnd = tl.typeText(8300, HASH, (s) => set({ digest: s }), 26, 22);
      tl.at(hashEnd + 500, () => set({ sealed: true, toast: true }));
      tl.at(hashEnd + 900, () => cursor.current?.hide());
      tl.at(hashEnd + 3300, () => set({ exit: true }));
      return hashEnd + 3750;
    },
  });

  const signed = st.full ? 2 : st.half ? 1 : 0;
  const status = st.full ? "COMPLETED" : st.half ? "PARTIALLY_SIGNED" : "SENT";

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H}
        label="Live example: the annual supply agreement is sent from a template in one pass. Title and both signers come prefilled, both parties sign in sequence, and the sealed copy carries a public verification code."
      >
        <div style={{ position: "absolute", inset: 0, background: "#fff" }}>
          <DemoChrome url="app.docurama.eu/templates" />

          {/* ── Scene A · templates gallery ── */}
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: 36, bottom: 0,
              opacity: st.scene === "a" ? 1 : 0,
              transform: st.scene === "a" ? "none" : "scale(.985)",
              transition: "opacity .3s ease, transform .3s ease",
            }}
          >
            <div style={{ position: "absolute", left: 40, top: 24 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: INK }}>Templates</p>
              <p style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Turn any repeatedly signed document into a template.</p>
            </div>

            {/* Template card 1 (active) */}
            <div
              style={{
                position: "absolute", left: 40, top: 92, width: 430, height: 330,
                background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 12,
                boxShadow: "0 10px 30px -18px rgba(26,26,26,.22)",
                opacity: st.in ? 1 : 0, transform: st.in ? "none" : "translateY(12px)",
                transition: "opacity .45s ease, transform .5s cubic-bezier(.22,1,.36,1)",
              }}
            >
              {/* Mini preview */}
              <div style={{ position: "absolute", left: 20, top: 20, width: 104, height: 134, background: WORKSPACE, border: `1px solid ${HAIR}`, borderRadius: 6, padding: 10 }}>
                <Bar w={64} />
                <div style={{ height: 7 }} />
                <Bar w={78} o={0.8} /><div style={{ height: 5 }} />
                <Bar w={70} o={0.8} /><div style={{ height: 5 }} />
                <Bar w={76} o={0.6} /><div style={{ height: 5 }} />
                <Bar w={50} o={0.6} />
                <span style={{ display: "block", marginTop: 10, borderBottom: `1.5px dashed #c9c6c1`, width: 62, height: 10 }} />
              </div>
              <div style={{ position: "absolute", left: 144, top: 20, right: 20 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: INK, lineHeight: 1.35 }}>Supply Agreement · Annual steel castings frame</p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, marginTop: 8 }}>
                  {["2 roles · prefilled", "Used 6 times", "Last sent Sep 2"].map((c) => (
                    <span key={c} style={{ fontSize: 8.5, borderRadius: 6, background: SOFT, color: MUTED, padding: "3px 8px" }}>{c}</span>
                  ))}
                </div>
                <p style={{ fontSize: 9.5, color: FAINT, lineHeight: 1.6, marginTop: 10 }}>
                  Frame terms, volumes and pricing for the casting programme.
                  Signers come from the template roles.
                </p>
              </div>
              <span
                style={{
                  ...btnPrimary(),
                  position: "absolute", right: 20, bottom: 18, width: 130,
                  transform: st.press ? "scale(.965)" : "scale(1)",
                  filter: st.press ? "brightness(.92)" : "none",
                  transition: "transform .14s ease, filter .14s ease",
                }}
              >
                <LayoutTemplate size={12} strokeWidth={2.2} />
                Use template
              </span>
            </div>

            {/* Template card 2 (muted) */}
            <div
              style={{
                position: "absolute", left: 502, top: 92, width: 430, height: 330,
                background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 12,
                opacity: st.in ? 1 : 0, transform: st.in ? "none" : "translateY(12px)",
                transition: "opacity .45s ease .12s, transform .5s cubic-bezier(.22,1,.36,1) .12s",
              }}
            >
              <div style={{ position: "absolute", left: 20, top: 20, width: 104, height: 134, background: WORKSPACE, border: `1px solid ${HAIR}`, borderRadius: 6, padding: 10, opacity: 0.55 }}>
                <Bar w={58} /><div style={{ height: 7 }} />
                <Bar w={74} o={0.7} /><div style={{ height: 5 }} />
                <Bar w={62} o={0.7} />
              </div>
              <div style={{ position: "absolute", left: 144, top: 20, right: 20, opacity: 0.62 }}>
                <p style={{ fontSize: 12.5, fontWeight: 600, color: INK }}>Foundry Partner Qualification</p>
                <div style={{ display: "flex", gap: 5, marginTop: 8 }}>
                  {["1 role", "Used 3 times"].map((c) => (
                    <span key={c} style={{ fontSize: 8.5, borderRadius: 6, background: SOFT, color: MUTED, padding: "3px 8px" }}>{c}</span>
                  ))}
                </div>
                <p style={{ fontSize: 9.5, color: FAINT, lineHeight: 1.6, marginTop: 10 }}>
                  Qualify a new foundry partner: audits, capacity and first-article evidence.
                </p>
              </div>
            </div>
          </div>

          {/* ── Scene B · prefilled send dialog ── */}
          <div
            aria-hidden
            style={{
              position: "absolute", left: 0, right: 0, top: 36, bottom: 0,
              background: "rgba(26,26,26,0.32)", backdropFilter: "blur(2px)",
              opacity: st.scene === "b" ? 1 : 0,
              transition: "opacity .22s ease",
              pointerEvents: "none",
            }}
          >
            <div
              style={{
                position: "absolute", left: 238, top: 52, width: 524, height: 356,
                background: "#fff", borderRadius: 14, border: `1px solid ${HAIR}`,
                boxShadow: "0 24px 64px -16px rgba(26,26,26,.28)",
                opacity: st.scene === "b" ? 1 : 0,
                transform: st.scene === "b" ? "scale(1) translateY(0)" : "scale(.965) translateY(8px)",
                transition: "opacity .24s ease, transform .3s cubic-bezier(.22,1,.36,1)",
              }}
            >
              <p style={{ position: "absolute", left: 24, top: 18, fontSize: 13, fontWeight: 600, color: INK }}>Send from template</p>
              <p style={{ position: "absolute", left: 24, top: 38, fontSize: 10, color: MUTED }}>
                Fields below come from the template. Review and send.
              </p>

              <p style={{ position: "absolute", left: 24, top: 72, fontSize: 9.5, fontWeight: 600, color: "#37352f" }}>Document title</p>
              <div
                style={{
                  position: "absolute", left: 24, top: 84, right: 24, height: 30, borderRadius: 8,
                  border: `1px solid ${HAIR}`, background: st.prefilled ? "#f3faf6" : "#fff",
                  display: "flex", alignItems: "center", paddingLeft: 10,
                  transition: "background .4s ease",
                }}
              >
                <span style={{ fontSize: 11, color: INK }}>Supply Agreement 2026 · Nordjärm Gjuteri</span>
              </div>

              <p style={{ position: "absolute", left: 24, top: 128, fontSize: 9.5, fontWeight: 600, color: "#37352f" }}>Recipients (sign in routing order)</p>
              {[
                { n: "Lars Bergström", e: "lars@nordjarm.example", role: "SIGNER 1" },
                { n: "Alexandra Fischer", e: "alex@stalfe.example", role: "SIGNER 2" },
              ].map((r, i) => (
                <div
                  key={r.e}
                  style={{
                    position: "absolute", left: 24, top: 140 + i * 44, width: 476, height: 36, borderRadius: 8,
                    border: `1px solid ${HAIR}`, background: st.prefilled ? "#f3faf6" : "#fff",
                    display: "flex", alignItems: "center", paddingLeft: 10, gap: 9,
                    transition: "background .4s ease",
                  }}
                >
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, fontSize: 8, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    {r.n.split(" ").map((p) => p[0]).join("")}
                  </span>
                  <span style={{ fontSize: 10.5, color: INK, fontWeight: 500 }}>{r.n}</span>
                  <span style={{ fontSize: 9.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>{r.e}</span>
                  <span style={{ marginLeft: "auto", marginRight: 8, fontSize: 7.5, fontWeight: 700, letterSpacing: ".08em", color: EMERALD, background: EMERALD_SOFT, borderRadius: 5, padding: "2px 7px" }}>{r.role}</span>
                </div>
              ))}

              <p style={{ position: "absolute", left: 24, top: 244, fontSize: 9.5, fontWeight: 600, color: "#37352f" }}>Message to signers</p>
              <div style={{ position: "absolute", left: 24, top: 256, right: 24, height: 40, borderRadius: 8, border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", paddingLeft: 10, background: st.prefilled ? "#f3faf6" : "#fff", transition: "background .4s ease" }}>
                <span style={{ fontSize: 10, color: MUTED }}>Frame agreement per the Q2 review · volumes in Annex 1.</span>
              </div>

              {st.prefilled && (
                <div
                  className="hero-chip-pop"
                  style={{ position: "absolute", left: 24, bottom: 22, fontSize: 8.5, borderRadius: 6, background: EMERALD_SOFT, color: EMERALD, fontWeight: 600, padding: "4px 9px", display: "flex", alignItems: "center", gap: 6 }}
                >
                  <FileSignature size={10} />
                  9 fields prefilled from the template
                </div>
              )}

              <div style={{ position: "absolute", right: 24, bottom: 18, display: "flex", gap: 10 }}>
                <span style={{ ...btnPrimary(), ...({ background: "#fff", color: INK, border: `1px solid ${HAIR}`, boxShadow: "none" } as object), width: 70 }}>Cancel</span>
                <span
                  style={{
                    ...btnPrimary(),
                    width: st.sending ? 128 : 156,
                    transform: st.sending ? "scale(.965)" : "scale(1)",
                    transition: "transform .14s ease, width .2s ease",
                  }}
                >
                  {st.sending ? (
                    <><Spinner /><span>Sending…</span></>
                  ) : (
                    <><Send size={12} strokeWidth={2.2} /><span>Send to 2 recipients</span></>
                  )}
                </span>
              </div>
            </div>
          </div>

          {/* ── Scene C · the sealed row ── */}
          <div
            style={{
              position: "absolute", left: 0, right: 0, top: 36, bottom: 0, background: "#fff",
              opacity: st.scene === "c" ? 1 : 0,
              transform: st.scene === "c" ? "none" : "translateX(12px)",
              transition: "opacity .3s ease, transform .3s ease",
            }}
          >
            <div style={{ position: "absolute", left: 40, top: 24 }}>
              <p style={{ fontSize: 15, fontWeight: 600, color: INK }}>Documents</p>
              <p style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Signer progress, reminders and cryptographic evidence.</p>
            </div>

            {/* The one row that matters */}
            <div style={{ position: "absolute", left: 40, right: 40, top: 96, opacity: st.rowIn ? 1 : 0, transform: st.rowIn ? "none" : "translateY(10px)", transition: "opacity .4s ease, transform .45s cubic-bezier(.22,1,.36,1)" }}>
              <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 150px 150px 160px", padding: "0 0 8px", borderBottom: `1px solid ${HAIR}` }}>
                {["DOCUMENT", "SIGNERS", "STATUS", "EVIDENCE DIGEST"].map((h) => (
                  <span key={h} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".07em", color: FAINT }}>{h}</span>
                ))}
              </div>
              <div
                style={{
                  position: "relative", height: 64,
                  display: "grid", gridTemplateColumns: "minmax(0,1fr) 150px 150px 160px", alignItems: "center",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                  <span style={{ width: 30, height: 30, borderRadius: 7, background: SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <FileSignature size={13} color={MUTED} />
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>Supply Agreement 2026 · Nordjärm Gjuteri</span>
                    <span style={{ display: "block", fontSize: 8.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace", marginTop: 1 }}>DOC-4N7Q2K</span>
                  </span>
                </div>
                <div>
                  <span style={{ fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{signed}/2 signed</span>
                  <span style={{ display: "block", width: 84, height: 4, borderRadius: 4, background: "#f0eeec", marginTop: 5, overflow: "hidden" }}>
                    <span style={{ display: "block", width: "100%", height: "100%", borderRadius: 4, background: EMERALD, transform: `scaleX(${signed / 2})`, transformOrigin: "left", transition: "transform .6s cubic-bezier(.22,1,.36,1) .15s" }} />
                  </span>
                </div>
                <div>
                  <DemoChip status={status} pop={`sup-${status}`} />
                </div>
                <div>
                  {st.digest ? (
                    <span style={{ fontSize: 9.5, color: MUTED, fontFamily: "var(--font-geist-mono), monospace" }}>
                      {st.digest}{st.digest.length < HASH.length ? <span className="hero-caret" style={{ color: EMERALD }}>|</span> : "…"}
                    </span>
                  ) : (
                    <span style={{ fontSize: 10, color: "#c8c4be" }}>not sealed</span>
                  )}
                </div>
                {(st.full && !st.sealed) && <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} className="hero-row-flash" />}
              </div>
            </div>

            {/* Sealed summary card */}
            <div
              style={{
                position: "absolute", left: 40, top: 232, width: 420,
                background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 12,
                padding: "16px 18px",
                opacity: st.sealed ? 1 : 0, transform: st.sealed ? "none" : "translateY(10px)",
                transition: "opacity .4s ease, transform .45s cubic-bezier(.22,1,.36,1)",
                display: st.scene === "c" ? "block" : "none",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <p style={{ fontSize: 11.5, fontWeight: 600, color: INK }}>Sealed and archived</p>
                <span style={{ fontSize: 8.5, fontWeight: 700, borderRadius: 5, padding: "2px 7px", background: "#dff3eb", color: EMERALD }}>PAdES B-LT</span>
              </div>
              <p style={{ fontSize: 9.5, color: MUTED, lineHeight: 1.7, marginTop: 6 }}>
                Both signatures captured · RFC 3161 timestamp applied · public
                verification code <span style={{ color: INK, fontFamily: "var(--font-geist-mono), monospace" }}>DOC-4N7Q2K</span>.
              </p>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                {["L. Bergström 10:41", "A. Fischer 10:52"].map((s) => (
                  <span key={s} style={{ fontSize: 8.5, borderRadius: 6, background: SOFT, color: MUTED, padding: "3px 8px", fontFamily: "var(--font-geist-mono), monospace" }}>{s}</span>
                ))}
              </div>
            </div>

            {st.sealed && (
              <div style={{ position: "absolute", left: 560, top: 216 }}>
                <RoundStamp show text="SEALED" sub="2026·09·15" size={88} />
              </div>
            )}
          </div>

          {/* Toast */}
          <ToastCard open={st.toast} title="Supply agreement sealed" sub="Signed copy archived · verification code DOC-4N7Q2K" />
        </div>
        <HeroCursor ref={cursorRef} />
      </DemoCanvas>
    </div>
  );
}
