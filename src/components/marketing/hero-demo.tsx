"use client";

/**
 * Notion-style hero product movie for the marketing page.
 *
 * A faithful miniature of the Docurama documents workspace replays the full
 * StålFe story on a loop: an EN 10204 3.1 mill certificate is prepared and
 * sent to the foundry partner, signed through typed-name adoption, sealed, and
 * proven with the cryptographic evidence drawer.
 *
 * Choreography:
 *  - a master timeline drives discrete state steps (setTimeout chain);
 *  - the cursor is a rAF spring with click ripples and a pen mode;
 *  - all element motion is transform/opacity CSS transitions (GPU friendly);
 *  - the loop pauses offscreen and restarts when visible;
 *  - prefers-reduced-motion renders the final sealed tableau, static.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { BadgeCheck, FileText, LayoutTemplate, Search, Send, Settings as SettingsIcon } from "lucide-react";
import { BrandMark } from "@/components/brand/logo";
import { HeroCursor, type HeroCursorApi } from "./hero-cursor";
import {
  DemoChip, DemoToast, EvidenceDrawer, HERO_EMAIL, HERO_HASH, NewEnvelopeModal, SealStamp, SignerScene,
} from "./hero-scenes";

const CANVAS_W = 1000;
const CANVAS_H = 600;

const INK = "#1a1a1a";
const MUTED = "#787671";
const FAINT = "#a8a29e";
const HAIR = "#e5e3df";
const SOFT = "#f6f5f4";
const WORKSPACE = "#fafaf9";
const EMERALD = "#0f7a5a";

type Row = {
  title: string;
  code: string;
  signed: number;
  total: number;
  status: "DRAFT" | "SENT" | "PARTIALLY_SIGNED" | "COMPLETED";
  digest: string | null;
};

const ROWS: Row[] = [
  { title: "EN 10204 3.1 Mill Certificate · S355J2 Plates", code: "DOC-8P4K2M", signed: 0, total: 1, status: "DRAFT", digest: null },
  { title: "Foundry Partner Qualification · Nordjärm Gjuteri", code: "DOC-7X2Q8B", signed: 1, total: 1, status: "COMPLETED", digest: "9f2c7e41a8b3" },
  { title: "Welding Procedure WPS-2219 · Qualification Record", code: "DOC-9K3L5N", signed: 1, total: 2, status: "PARTIALLY_SIGNED", digest: null },
  { title: "Purchase Order PO-2026-0417 · Steel Castings", code: "DOC-5M8T2V", signed: 0, total: 1, status: "SENT", digest: null },
  { title: "Inspection Certificate 3.2 · Pressure Housings", code: "DOC-3R7W6Y", signed: 2, total: 2, status: "COMPLETED", digest: "4d81e0c77a12" },
];

type DemoState = {
  rows: boolean;
  modal: boolean;
  emailFocus: boolean;
  typed: string;
  sending: boolean;
  sent: boolean;
  toast: boolean;
  scene: "a" | "b" | "c";
  sigFocus: boolean;
  signing: boolean;
  adoptReady: boolean;
  adopting: boolean;
  signed: boolean;
  drawer: boolean;
  hash: string;
  audit: boolean;
  seal: boolean;
  exit: boolean;
};

const INITIAL: DemoState = {
  rows: false, modal: false, emailFocus: false, typed: "", sending: false,
  sent: false, toast: false, scene: "a", sigFocus: false, signing: false,
  adoptReady: false, adopting: false, signed: false, drawer: false,
  hash: "", audit: false, seal: false, exit: false,
};

/** The sealed end state, used for the reduced-motion static tableau. */
const FINAL: DemoState = {
  ...INITIAL, rows: true, scene: "c", sent: true, drawer: true,
  hash: HERO_HASH, audit: true, seal: true,
};

export function HeroDemo() {
  const [st, setSt] = useState<DemoState>(INITIAL);
  const [press, setPress] = useState({ new: false, send: false });
  const [fit, setFit] = useState({ scale: 1, ox: 0, oy: 0, w: CANVAS_W, h: CANVAS_H });
  const [reduced, setReduced] = useState(false);

  const wrapRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HeroCursorApi>(null);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const playing = useRef(false);

  /* ── Responsive canvas scaling ─────────────────────────────────── */
  useLayoutEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w === 0) return;
      const scale = Math.min(w / CANVAS_W, 1);
      const scaledW = CANVAS_W * scale;
      const scaledH = CANVAS_H * scale;
      setFit({
        scale,
        ox: Math.max(0, (w - scaledW) / 2),
        oy: 0,
        w: scaledW,
        h: scaledH,
      });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ── Motion preference ─────────────────────────────────────────── */
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      setReduced(mq.matches);
      if (mq.matches) setSt(FINAL);
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  /* ── Master timeline ───────────────────────────────────────────── */
  const clearTimers = useCallback(() => {
    timers.current.forEach(clearTimeout);
    timers.current = [];
  }, []);

  const playRef = useRef<() => void>(() => {});

  const play = useCallback(() => {
    clearTimers();
    const at = (ms: number, fn: () => void) => timers.current.push(setTimeout(fn, ms));
    setSt(INITIAL);
    setPress({ new: false, send: false });

    /* Scene A · the workspace table */
    at(650, () => setSt((s) => ({ ...s, rows: true })));
    at(2150, () => cursorRef.current?.show(706, 520));
    at(2250, () => cursorRef.current?.moveTo(879, 76));          // New envelope
    at(3030, () => { cursorRef.current?.click(); setPress((p) => ({ ...p, new: true })); });
    at(3190, () => setPress((p) => ({ ...p, new: false })));
    at(3110, () => setSt((s) => ({ ...s, modal: true })));
    at(3420, () => cursorRef.current?.moveTo(568, 295));         // recipient email
    at(4050, () => { cursorRef.current?.click(); setSt((s) => ({ ...s, emailFocus: true })); });

    // Typing the signer email with human cadence
    let ts = 4190;
    for (let i = 1; i <= HERO_EMAIL.length; i++) {
      ts += 32 + Math.random() * 30;
      const slice = HERO_EMAIL.slice(0, i);
      at(ts, () => setSt((s) => ({ ...s, typed: slice })));
    }
    const valid = (s: string) => s.includes("@") && s.includes(".", s.indexOf("@"));

    at(ts + 130, () => cursorRef.current?.moveTo(752, 496));     // Send to 1 recipient
    at(ts + 690, () => { cursorRef.current?.click(); setSt((s) => ({ ...s, sending: true })); setPress((p) => ({ ...p, send: true })); });
    at(ts + 730, () => setPress((p) => ({ ...p, send: false })));
    at(ts + 1290, () => setSt((s) => ({ ...s, modal: false, sending: false, sent: true, emailFocus: false })));
    at(ts + 1410, () => setSt((s) => ({ ...s, toast: true })));

    /* Scene B · the signer's view */
    const cut1 = ts + 1930;
    at(cut1, () => setSt((s) => ({ ...s, scene: "b", toast: false })));
    at(cut1 + 60, () => cursorRef.current?.moveTo(498, 442));    // signature field
    at(cut1 + 620, () => { cursorRef.current?.click(); setSt((s) => ({ ...s, sigFocus: true })); });
    at(cut1 + 740, () => cursorRef.current?.setPen(true));
    const sg = cut1 + 810;                                        // signature strokes start
    at(sg, () => setSt((s) => ({ ...s, signing: true })));
    const waypoints: [number, number][] = [[424, 438], [458, 446], [492, 432], [526, 446], [558, 434], [574, 441]];
    waypoints.forEach(([x, y], i) => at(sg + 80 + i * 215, () => cursorRef.current?.moveTo(x, y)));
    const sgEnd = sg + 1360;
    at(sgEnd + 60, () => cursorRef.current?.setPen(false));
    at(sgEnd + 70, () => setSt((s) => ({ ...s, adoptReady: true })));
    at(sgEnd + 130, () => cursorRef.current?.moveTo(866, 568));   // Adopt and sign
    at(sgEnd + 690, () => { cursorRef.current?.click(); setSt((s) => ({ ...s, adopting: true })); });
    at(sgEnd + 1240, () => setSt((s) => ({ ...s, adopting: false, signed: true })));

    /* Scene C · sealed and proven */
    const cut2 = sgEnd + 1660;
    at(cut2, () => {
      setSt((s) => ({ ...s, scene: "c" }));
      cursorRef.current?.moveTo(590, 300);                        // clear of the drawer
    });
    at(cut2 + 320, () => setSt((s) => ({ ...s, drawer: true })));
    let hs = cut2 + 780;                                          // digest types out
    for (let i = 1; i <= HERO_HASH.length; i++) {
      hs += 24 + Math.random() * 20;
      const slice = HERO_HASH.slice(0, i);
      at(hs, () => setSt((s) => ({ ...s, hash: slice })));
    }
    at(cut2 + 1060, () => setSt((s) => ({ ...s, audit: true })));
    at(hs + 900, () => setSt((s) => ({ ...s, seal: true })));
    at(hs + 1360, () => cursorRef.current?.hide());

    /* Loop */
    const end = hs + 2500;
    at(end, () => setSt((s) => ({ ...s, exit: true })));
    at(end + 440, () => playRef.current());
  }, [clearTimers]);

  useEffect(() => {
    playRef.current = play;
  }, [play]);

  /* ── Play only while visible; restart on re-entry ─────────────── */
  useEffect(() => {
    if (reduced) return;
    const el = wrapRef.current;
    if (!el) return;
    const start = () => {
      if (playing.current) return;
      playing.current = true;
      play();
    };
    const stop = () => {
      playing.current = false;
      clearTimers();
      cursorRef.current?.hide();
      setSt(INITIAL);
    };
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting && !document.hidden ? start() : stop()),
      { threshold: 0.15 },
    );
    io.observe(el);
    const onVis = () => (document.hidden ? stop() : start());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      clearTimers();
    };
  }, [reduced, play, clearTimers]);

  /* ── Derived row state for the table ──────────────────────────── */
  const sealedScene = st.scene === "c";
  const row1 = ROWS[0];
  const row1Status: Row["status"] = sealedScene ? "COMPLETED" : st.sent ? "SENT" : "DRAFT";
  const row1Signed = sealedScene || st.sent ? 1 : 0;
  const row1Digest = sealedScene ? HERO_HASH.slice(0, 12) : null;
  const chipPopKey = `${row1Status}-${st.sent}-${sealedScene}`;

  const exitStyle = {
    opacity: st.exit ? 0 : 1,
    transition: "opacity .4s ease",
  };

  return (
    <div
      ref={wrapRef}
      role="img"
      aria-label="Illustrative product demo with synthetic values: an EN 10204 3.1 mill certificate from StålFe is sent to the foundry partner, signed through typed-name adoption, sealed, and verified with cryptographic evidence."
      className="relative w-full mx-auto"
      style={{ height: fit.h, maxWidth: CANVAS_W }}
    >
      {/* Window frame: letterboxed, settle-entrance once */}
      <div
        className="hero-settle"
        style={{
          position: "relative", width: fit.w, height: fit.h, marginInline: "auto",
          overflow: "hidden", borderRadius: 13,
          border: `1px solid ${HAIR}`,
          background: "#fff",
          boxShadow: "0 1px 2px rgba(26,26,26,.05), 0 16px 40px -12px rgba(26,26,26,.18), 0 40px 80px -32px rgba(15,122,90,.14)",
        }}
      >
      <div
        style={{
          width: CANVAS_W, height: CANVAS_H,
          transform: `scale(${fit.scale})`, transformOrigin: "top left",
          position: "absolute", top: 0, left: 0,
        }}
      >
        <div style={{ width: "100%", height: "100%", position: "relative", background: "#fff" }}>
          {/* Browser chrome */}
          <div style={{ height: 44, background: SOFT, borderBottom: `1px solid ${HAIR}`, position: "relative", flexShrink: 0 }}>
            <span style={{ position: "absolute", left: 20, top: 22, width: 11, height: 11, borderRadius: "50%", background: "#ff5f57", transform: "translate(-50%,-50%)" }} />
            <span style={{ position: "absolute", left: 38, top: 22, width: 11, height: 11, borderRadius: "50%", background: "#febc2e", transform: "translate(-50%,-50%)" }} />
            <span style={{ position: "absolute", left: 56, top: 22, width: 11, height: 11, borderRadius: "50%", background: "#28c840", transform: "translate(-50%,-50%)" }} />
            <span style={{ position: "absolute", left: 300, right: 300, top: 8, height: 28, borderRadius: 14, background: "#fff", border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
              {/* lock */}
              <svg width="9" height="11" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4">
                <rect x="4" y="11" width="16" height="10" rx="2" />
                <path d="M8 11V7a4 4 0 0 1 8 0v4" />
              </svg>
              <span style={{ fontSize: 10.5, color: MUTED }}>app.docurama.eu/documents</span>
            </span>
          </div>

          {/* App body */}
          <div style={{ position: "absolute", top: 44, left: 0, right: 0, bottom: 0, display: "flex" }}>
            {/* Icon rail */}
            <div style={{ width: 56, background: WORKSPACE, borderRight: `1px solid ${HAIR}`, position: "relative", flexShrink: 0 }}>
              <span style={{ position: "absolute", left: 14, top: 16 }}><BrandMark className="h-7 w-7" /></span>
              <span style={{ position: "absolute", left: 10, top: 72, width: 36, height: 34, borderRadius: 9, background: EMERALD, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center" }}><FileText size={15} /></span>
              <span style={{ position: "absolute", left: 10, top: 114, width: 36, height: 34, borderRadius: 9, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}><LayoutTemplate size={15} /></span>
              <span style={{ position: "absolute", left: 10, top: 156, width: 36, height: 34, borderRadius: 9, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}><BadgeCheck size={15} /></span>
              <span style={{ position: "absolute", left: 10, bottom: 16, width: 36, height: 34, borderRadius: 9, color: MUTED, display: "flex", alignItems: "center", justifyContent: "center" }}><SettingsIcon size={15} /></span>
            </div>

            {/* Main column */}
            <div style={{ position: "relative", flex: 1, minWidth: 0, overflow: "hidden" }}>
              {/* ── Scene A/C · documents table ── */}
              <div
                style={{
                  position: "absolute", inset: 0, background: "#fff",
                  opacity: st.exit || st.scene === "b" ? 0 : 1,
                  transform: st.scene === "b" ? "translateX(-16px)" : "none",
                  transition: "opacity .35s ease, transform .3s ease",
                }}
              >
                {/* Header */}
                <div style={{ position: "absolute", left: 16, top: 14 }}>
                  <p style={{ fontSize: 16, fontWeight: 600, color: INK, letterSpacing: "-.01em" }}>Documents</p>
                  <p style={{ fontSize: 10.5, color: MUTED, marginTop: 2 }}>Signer progress, reminders and cryptographic evidence.</p>
                </div>
                <div style={{ position: "absolute", left: 420, top: 20, width: 176, height: 30, borderRadius: 8, background: SOFT, border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", gap: 7, paddingLeft: 10 }}>
                  <Search size={11} color={FAINT} />
                  <span style={{ fontSize: 10.5, color: FAINT }}>Search documents…</span>
                </div>
                <div
                  style={{
                    position: "absolute", left: 750, top: 18, width: 146, height: 34, borderRadius: 8,
                    background: EMERALD, color: "#fff",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
                    fontSize: 11.5, fontWeight: 600,
                    transform: press.new ? "scale(.965)" : "scale(1)",
                    filter: press.new ? "brightness(.92)" : "none",
                    transition: "transform .14s ease, filter .14s ease",
                    boxShadow: "0 1px 2px rgba(15,122,90,.25)",
                  }}
                >
                  <Send size={12} strokeWidth={2.3} />
                  New envelope
                </div>

                {/* Tabs */}
                <div style={{ position: "absolute", left: 16, top: 66, display: "flex", gap: 18 }}>
                  {[["All", true], ["Sent", false], ["Partially signed", false], ["Completed", false], ["Draft", false]].map(([t, active]) => (
                    <span key={t as string} style={{ position: "relative", fontSize: 11, fontWeight: active ? 600 : 500, color: active ? INK : FAINT, paddingBottom: 7 }}>
                      {t as string}
                      {active ? <span style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 2, borderRadius: 2, background: EMERALD }} /> : null}
                    </span>
                  ))}
                </div>

                {/* Table */}
                <div style={{ position: "absolute", left: 16, right: 0, top: 98, ...exitStyle }}>
                  {/* Column headers */}
                  <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) 130px 118px 128px", padding: "0 16px 7px 0", borderBottom: `1px solid ${HAIR}` }}>
                    {["DOCUMENT", "SIGNERS", "STATUS", "EVIDENCE DIGEST"].map((h) => (
                      <span key={h} style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: ".07em", color: FAINT }}>{h}</span>
                    ))}
                  </div>

                  {ROWS.map((r, i) => {
                    const isRow1 = i === 0;
                    const status = isRow1 ? row1Status : r.status;
                    const signed = isRow1 ? row1Signed : r.signed;
                    const digest = isRow1 ? row1Digest : r.digest;
                    const filled = signed / r.total;
                    const yt = 14 + i * 66;
                    return (
                      <div
                        key={r.code}
                        style={{
                          position: "relative",
                          height: 66,
                          display: "grid",
                          gridTemplateColumns: "minmax(0,1fr) 130px 118px 128px",
                          alignItems: "center",
                          paddingRight: 16,
                          borderBottom: i < ROWS.length - 1 ? `1px solid #f0eeec` : "none",
                          opacity: st.rows ? 1 : 0,
                          transform: st.rows ? "none" : "translateY(14px)",
                          transition: `opacity .42s ease ${(i * 105).toString()}ms, transform .42s cubic-bezier(.22,1,.36,1) ${(i * 105).toString()}ms`,
                        }}
                      >
                        {/* Title cell */}
                        <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
                          <span style={{ width: 30, height: 30, borderRadius: 7, background: SOFT, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                            <FileText size={13} color={MUTED} />
                          </span>
                          <span style={{ minWidth: 0 }}>
                            <span style={{ display: "block", fontSize: 11.5, fontWeight: 500, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{r.title}</span>
                            <span style={{ display: "block", fontSize: 8.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace", marginTop: 1 }}>{r.code}</span>
                          </span>
                        </div>
                        {/* Signers cell */}
                        <div>
                          <span style={{ fontSize: 10, color: MUTED, fontVariantNumeric: "tabular-nums" }}>{signed}/{r.total} signed</span>
                          <span style={{ display: "block", width: 72, height: 4, borderRadius: 4, background: "#f0eeec", marginTop: 5, overflow: "hidden" }}>
                            <span style={{
                              display: "block", width: "100%", height: "100%", borderRadius: 4, background: EMERALD,
                              transform: `scaleX(${filled})`, transformOrigin: "left",
                              transition: "transform .6s cubic-bezier(.22,1,.36,1) .15s",
                            }} />
                          </span>
                        </div>
                        {/* Status cell */}
                        <div>{isRow1 ? <DemoChip status={status} pop={chipPopKey} /> : <DemoChip status={r.status} />}</div>
                        {/* Digest cell */}
                        <div>
                          {digest ? (
                            <span style={{ fontSize: 9.5, color: MUTED, fontFamily: "var(--font-geist-mono), monospace" }}>{digest}…</span>
                          ) : (
                            <span style={{ fontSize: 10, color: "#c8c4be" }}>not sealed</span>
                          )}
                        </div>
                        {/* The sent pulse: a highlight sweep when row 1 turns SENT */}
                        {isRow1 && st.sent && !sealedScene && (
                          <span style={{ position: "absolute", inset: 0, pointerEvents: "none" }} className="hero-row-flash" />
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Footer hint */}
                <div style={{ position: "absolute", left: 16, bottom: 12, fontSize: 9.5, color: FAINT, opacity: st.rows ? 1 : 0, transition: "opacity .5s ease .6s" }}>
                  Showing 5 of 17 envelopes · page 1 of 4
                </div>
              </div>

              {/* ── Scene B · signer view ── */}
              <SignerScene
                visible={st.scene === "b"}
                sigFocus={st.sigFocus}
                signing={st.signing}
                signed={st.signed}
                adopting={st.adopting}
                adoptReady={st.adoptReady}
              />

              {/* ── Evidence drawer (scene C) ── */}
              <div style={{ position: "absolute", inset: 0, opacity: st.exit ? 0 : 1, transition: "opacity .4s ease" }}>
                <EvidenceDrawer open={st.drawer && st.scene === "c"} hash={st.hash} audit={st.audit} />
              </div>

              {/* Seal stamp over row 1 */}
              <SealStamp show={st.seal && st.scene === "c"} />

              {/* ── New envelope modal (scene A) ── */}
              <NewEnvelopeModal
                open={st.modal}
                typed={st.typed}
                emailFocus={st.emailFocus}
                sending={st.sending}
                valid={st.typed.includes("@") && st.typed.slice(st.typed.indexOf("@")).includes(".")}
              />

              {/* Toast */}
              <DemoToast open={st.toast} />
            </div>
          </div>

          {/* Cursor last, above everything */}
          <HeroCursor ref={cursorRef} />
        </div>
      </div>
      </div>
    </div>
  );
}
