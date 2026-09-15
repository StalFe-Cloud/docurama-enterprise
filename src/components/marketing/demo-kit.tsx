"use client";

/**
 * Shared kit for the marketing page live demos (the hero product movie, the
 * bento table and verify demos, and the tabbed live examples).
 *
 * Everything a demo needs beyond its own choreography lives here:
 *  - Timeline: a setTimeout chain with a human-cadence typing helper;
 *  - DemoCanvas: a fixed logical canvas that scales to its container but
 *    never below a readability floor (it scrolls horizontally instead of
 *    shrinking to illegibility on phones);
 *  - useDemoLifecycle: play while visible, pause offscreen and on hidden
 *    tabs, restart on re-entry;
 *  - atoms: chrome bar, buttons, the StålFe letterhead, signature fields
 *    that draw themselves, round stamps, toasts and status chips.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Check, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HeroCursorApi } from "./hero-cursor";

export { HeroCursor, type HeroCursorApi } from "./hero-cursor";
export { DemoChip } from "./hero-scenes";

/* ── Palette (shared with the hero scenes) ────────────────────────── */

export const INK = "#1a1a1a";
export const MUTED = "#787671";
export const FAINT = "#a8a29e";
export const HAIR = "#e5e3df";
export const SOFT = "#f6f5f4";
export const WORKSPACE = "#fafaf9";
export const EMERALD = "#0f7a5a";
export const EMERALD_SOFT = "#dff3eb";
export const SUCCESS = "#1a7f37";
export const SUCCESS_SOFT = "#d9f3e1";
export const INFO = "#0075de";
export const INFO_SOFT = "#dcecfa";
export const NAVY = "#14284b"; // StålFe brand colour, from their logo
export const MONO = "var(--font-geist-mono), monospace";

/* ── Timeline ─────────────────────────────────────────────────────── */

export class Timeline {
  private timers: ReturnType<typeof setTimeout>[] = [];

  /** Schedule a step at ms from play start. */
  at(ms: number, fn: () => void): number {
    this.timers.push(setTimeout(fn, ms));
    return ms;
  }

  /**
   * Type text character by character with a human cadence. Returns the
   * timestamp at which the last character lands.
   */
  typeText(atMs: number, text: string, onSlice: (s: string) => void, min = 34, jitter = 30): number {
    let t = atMs;
    for (let i = 1; i <= text.length; i++) {
      t += min + Math.random() * jitter;
      const slice = text.slice(0, i);
      this.at(t, () => onSlice(slice));
    }
    return t;
  }

  clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}

/* ── Canvas: fixed logical size, readability floor ────────────────── */

/**
 * Scales a fixed logical canvas into the available width. When the natural
 * scale would drop below `minScale` (phones), the canvas holds the floor and
 * the wrapper scrolls horizontally instead, keeping every label legible.
 */
export function DemoCanvas({
  w, h, minScale, maxH, label, children, className,
}: {
  w: number;
  h: number;
  minScale?: number;
  maxH?: number;
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  const outerRef = useRef<HTMLDivElement>(null);
  const [dim, setDim] = useState({ scale: 1, iw: w, ih: h });

  useLayoutEffect(() => {
    const el = outerRef.current;
    if (!el) return;
    const measure = () => {
      const cw = el.clientWidth;
      if (cw === 0) return;
      // Fit to container width, capped at 1.0 (natural size)
      let scale = Math.min(cw / w, 1);
      if (maxH) scale = Math.min(scale, maxH / h);
      // Only enforce minScale if container width allows it, avoiding forced horizontal overflow
      if (minScale && cw >= w * minScale) scale = Math.max(scale, minScale);
      setDim({ scale, iw: w * scale, ih: h * scale });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [w, h, minScale, maxH]);

  return (
    <div
      ref={outerRef}
      role="img"
      aria-label={label}
      className={cn("w-full overflow-hidden", className)}
    >
      <div style={{ position: "relative", width: dim.iw, height: dim.ih, marginInline: "auto" }}>
        <div
          style={{
            position: "absolute", top: 0, left: 0, width: w, height: h,
            transform: `scale(${dim.scale})`, transformOrigin: "top left",
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

/* ── Lifecycle: play while visible ────────────────────────────────── */

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => setReduced(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);
  return reduced;
}

/**
 * Attaches to the demo's outermost element: starts `start` when it enters
 * the viewport (and the tab is focused), calls `stop` when it leaves, and
 * restarts on re-entry. `start` is expected to be idempotent per run.
 */
export function useDemoLifecycle(start: () => void, stop: () => void): React.RefObject<HTMLDivElement | null> {
  const ref = useRef<HTMLDivElement>(null);
  const playing = useRef(false);
  const startRef = useRef(start);
  const stopRef = useRef(stop);

  // Keep the latest callbacks reachable from the observer without re-binding it.
  useEffect(() => {
    startRef.current = start;
    stopRef.current = stop;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const begin = () => {
      if (playing.current) return;
      playing.current = true;
      startRef.current();
    };
    const halt = () => {
      if (!playing.current) return;
      playing.current = false;
      stopRef.current();
    };
    const io = new IntersectionObserver(
      ([e]) => (e.isIntersecting && !document.hidden ? begin() : halt()),
      { threshold: 0.15 },
    );
    io.observe(el);
    const onVis = () => (document.hidden ? halt() : begin());
    document.addEventListener("visibilitychange", onVis);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      halt();
    };
  }, []);

  return ref;
}

/* ── Atoms ────────────────────────────────────────────────────────── */

/** Slim browser chrome with a URL pill, for in-product scenes. */
export function DemoChrome({ url, children }: { url: string; children?: React.ReactNode }) {
  return (
    <div style={{ height: 36, background: SOFT, borderBottom: `1px solid ${HAIR}`, position: "relative", flexShrink: 0 }}>
      <span style={{ position: "absolute", left: 18, top: 18, width: 10, height: 10, borderRadius: "50%", background: "#ff5f57", transform: "translate(-50%,-50%)" }} />
      <span style={{ position: "absolute", left: 34, top: 18, width: 10, height: 10, borderRadius: "50%", background: "#febc2e", transform: "translate(-50%,-50%)" }} />
      <span style={{ position: "absolute", left: 50, top: 18, width: 10, height: 10, borderRadius: "50%", background: "#28c840", transform: "translate(-50%,-50%)" }} />
      <span style={{ position: "absolute", left: 250, right: 250, top: 7, height: 22, borderRadius: 11, background: "#fff", border: `1px solid ${HAIR}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <svg width="8" height="10" viewBox="0 0 24 24" fill="none" stroke={FAINT} strokeWidth="2.4" style={{ marginRight: 5 }}>
          <rect x="4" y="11" width="16" height="10" rx="2" />
          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
        </svg>
        <span style={{ fontSize: 9.5, color: MUTED }}>{url}</span>
      </span>
      {children}
    </div>
  );
}

export function btnPrimary(extra?: React.CSSProperties): React.CSSProperties {
  return {
    height: 32, borderRadius: 8, background: EMERALD, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    fontSize: 11, fontWeight: 600,
    boxShadow: "0 1px 2px rgba(15,122,90,.3)",
    ...extra,
  };
}

export function btnOutline(extra?: React.CSSProperties): React.CSSProperties {
  return {
    height: 32, borderRadius: 8, background: "#fff", color: INK,
    border: `1px solid ${HAIR}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 500,
    ...extra,
  };
}

/** The real StålFe mark (hexagon SF) and wordmark, as inline images. */
export function StalfeMark({ size = 26 }: { size?: number }) {
  return (
    <img src="/brand/stalfe-mark.png" alt="" width={Math.round(size * 0.86)} height={size} style={{ display: "block" }} />
  );
}

export function StalfeWordmark({ height = 13 }: { height?: number }) {
  return (
    <img src="/brand/stalfe-wordmark.png" alt="StålFe" style={{ height, width: "auto", display: "block" }} />
  );
}

/** Document letterhead used on the demo papers. */
export function StalfeLetterhead({ compact = false }: { compact?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <StalfeMark size={compact ? 22 : 27} />
      <span>
        <StalfeWordmark height={compact ? 11 : 13} />
        <span style={{ display: "block", fontSize: compact ? 6.5 : 7, color: FAINT, letterSpacing: ".14em", marginTop: 2 }}>
          FOUNDRY &amp; INDUSTRIAL SUPPLY CHAIN
        </span>
      </span>
    </div>
  );
}

/* ── Signature fields ─────────────────────────────────────────────── */

export type Stroke = { d: string; delay: number; dur: number };

/**
 * A dashed signature box whose strokes draw themselves while `drawing` is
 * true. `strokes` are SVG paths in a 170 x 46 viewBox, scaled to the box.
 */
export function SignatureField({
  w, h, strokes, drawing, tint = EMERALD, children,
}: {
  w: number;
  h: number;
  strokes: Stroke[];
  drawing: boolean;
  tint?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      style={{
        width: w, height: h,
        border: `1.5px dashed ${drawing ? tint : "#d1d1d1"}`,
        borderRadius: 8,
        background: drawing ? "rgba(15,122,90,.03)" : "#fff",
        transition: "border-color .2s ease, background .2s ease",
        display: "flex", alignItems: "center", justifyContent: "center",
        position: "relative",
      }}
    >
      <svg width={w - 18} height={h - 12} viewBox="0 0 170 46" fill="none" preserveAspectRatio="xMidYMid meet">
        {strokes.map((s, i) => (
          <path
            key={i}
            d={s.d}
            stroke={INK}
            strokeWidth={1.7}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            strokeDasharray={1}
            style={{
              strokeDashoffset: drawing ? 0 : 1,
              transition: `stroke-dashoffset ${s.dur}ms cubic-bezier(.45,.05,.35,1) ${s.delay}ms`,
            }}
          />
        ))}
      </svg>
      {children}
    </div>
  );
}

/* ── Signature stroke sets, one per persona ───────────────────────── */

/** Lars Bergström (the hero signer): calm, connected cursive. */
export const SIG_LARS: Stroke[] = [
  { d: "M 8,38 C 6,26 7,12 12,6 C 14,4 17,5 17,9 C 17,15 13,26 9,34 C 8,36 9,38 12,37 C 18,35 24,31 29,26", delay: 0, dur: 300 },
  { d: "M 38,36 C 35,34 34,30 37,27 C 40,24 45,26 46,30 C 47,34 44,37 41,36 C 46,38 51,35 53,29 C 55,24 58,23 60,27 C 62,31 60,35 64,33 C 70,30 72,23 77,21 C 81,19 83,25 88,23 C 93,21 96,27 102,25 C 108,23 111,17 117,19 C 122,21 121,27 127,27 C 132,27 135,22 140,20", delay: 340, dur: 470 },
  { d: "M 150,34 C 147,26 148,12 153,6 C 155,3 158,4 158,8 C 158,14 155,24 151,32 C 150,34 151,35 154,34 C 159,32 164,29 165,24 C 166,20 163,17 159,19 C 155,21 153,26 152,31", delay: 860, dur: 290 },
  { d: "M 14,42 C 40,39 80,41 105,38 C 122,36 138,36 150,32", delay: 1180, dur: 170 },
];

/** Elisa Righi: angular, wide, decisive. */
export const SIG_ELISA: Stroke[] = [
  { d: "M 10,36 C 7,28 9,12 16,7 C 20,4 23,7 21,12 C 19,17 12,21 7,22 C 13,25 22,23 30,20", delay: 0, dur: 300 },
  { d: "M 34,34 C 32,28 36,24 40,26 C 44,28 43,33 39,33 C 45,35 50,31 52,25 C 54,20 57,19 58,24 C 59,29 57,33 61,31 C 67,28 69,20 76,18 C 82,16 84,24 91,22 C 98,20 100,14 106,15 C 112,16 111,24 118,23 C 126,22 130,16 138,18", delay: 320, dur: 430 },
  { d: "M 146,33 C 143,24 145,10 151,6 C 154,4 157,6 156,11 C 155,17 151,26 147,32", delay: 800, dur: 230 },
  { d: "M 8,41 C 46,44 96,40 148,34", delay: 1060, dur: 160 },
];

/** Klaus Werner: compact, forward-slanted. */
export const SIG_KLAUS: Stroke[] = [
  { d: "M 14,34 C 10,26 12,12 18,7 C 21,5 23,8 21,12 C 19,16 14,20 10,21 C 15,23 21,21 26,19 M 20,18 C 24,22 28,28 30,33", delay: 0, dur: 320 },
  { d: "M 36,30 C 34,26 37,23 40,25 C 43,27 42,31 38,30 C 43,32 47,28 49,23 C 51,18 55,17 56,22 C 57,27 55,30 59,28 C 64,25 66,18 72,17 C 78,16 78,24 84,23 C 90,22 93,16 99,17 C 104,18 104,25 110,24 C 116,23 120,18 126,20", delay: 360, dur: 420 },
  { d: "M 134,32 C 132,24 134,12 139,8 C 142,6 144,9 143,13 C 142,18 139,25 136,30", delay: 840, dur: 210 },
  { d: "M 10,40 C 50,42 100,39 142,32", delay: 1080, dur: 150 },
];

/** Jonas Ekberg: an engineer's terse, angular initials with a flick. */
export const SIG_JONAS: Stroke[] = [
  { d: "M 34,7 C 35,9 35,12 35,15 C 35,23 32,31 25,35 C 20,38 14,36 15,32 C 16,29 21,29 26,28 C 31,27 36,25 40,22", delay: 0, dur: 300 },
  { d: "M 48,24 L 40,27 M 50,31 C 55,30 60,27 64,23 C 67,19 70,19 70,23 C 70,27 68,30 73,29 C 78,28 81,23 86,23 C 90,23 91,27 96,26", delay: 340, dur: 300 },
  { d: "M 20,41 C 48,39 84,38 110,33", delay: 680, dur: 150 },
];

/** Alexandra Fischer: an elegant open-tailed signature. */
export const SIG_ALEX: Stroke[] = [
  { d: "M 12,36 C 16,24 22,10 28,7 C 32,5 33,10 31,16 C 29,24 24,31 19,35 M 19,27 C 26,24 36,22 45,23", delay: 0, dur: 320 },
  { d: "M 52,32 C 49,28 52,24 56,26 C 60,28 59,33 54,32 C 60,34 66,30 68,24 C 70,19 74,19 74,24 C 74,29 72,32 77,30 C 83,27 85,20 92,19 C 98,18 98,26 105,25 C 112,24 115,18 121,19 C 127,20 126,27 133,26 C 139,25 143,20 149,22", delay: 340, dur: 440 },
  { d: "M 10,42 C 60,44 120,40 156,30", delay: 820, dur: 180 },
];

/* ── Round stamp ──────────────────────────────────────────────────── */

export function RoundStamp({
  show, text, sub, color = EMERALD, size = 84, rot = "-9deg",
}: {
  show: boolean;
  text: string;
  sub?: string;
  color?: string;
  size?: number;
  rot?: string;
}) {
  if (!show) return null;
  const inner = Math.round(size * 0.74);
  return (
    <div aria-hidden style={{ pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: -13 }}>
        <span className="hero-impact" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid ${color}66` }} />
      </div>
      <div
        className="hero-stamp"
        style={{
          "--stamp-rot": rot,
          width: size, height: size, borderRadius: "50%",
          border: `2.5px solid ${color}`,
          color,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: color === EMERALD
            ? "radial-gradient(circle at 32% 28%, rgba(255,255,255,.6), rgba(223,243,235,.88) 68%), rgba(223,243,235,.86)"
            : "radial-gradient(circle at 32% 28%, rgba(255,255,255,.6), rgba(20,40,75,.1) 68%), rgba(20,40,75,.1)",
          boxShadow: `inset 0 0 0 4px ${color}18, inset 0 2px 10px ${color}1c, 0 4px 14px ${color}2e`,
        } as React.CSSProperties}
      >
        <span style={{ width: inner, height: inner, borderRadius: "50%", border: `1.5px dashed ${color}8c`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <Check size={Math.round(size * 0.18)} strokeWidth={3} />
          <span style={{ fontSize: Math.round(size * 0.115), fontWeight: 800, letterSpacing: ".14em", whiteSpace: "nowrap" }}>{text}</span>
          {sub ? <span style={{ fontSize: Math.round(size * 0.07), fontFamily: MONO, letterSpacing: ".08em" }}>{sub}</span> : null}
        </span>
      </div>
    </div>
  );
}

/* ── Toast ────────────────────────────────────────────────────────── */

export function ToastCard({
  open, title, sub, icon, x = "right", y = 18,
}: {
  open: boolean;
  title: string;
  sub: string;
  icon?: React.ReactNode;
  x?: "right" | "left";
  y?: number;
}) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", [x === "right" ? "right" : "left"]: 22, bottom: y, zIndex: 45,
        display: "flex", alignItems: "center", gap: 10,
        background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 12px 32px -8px rgba(26,26,26,.24)",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(12px)",
        transition: "opacity .3s ease, transform .3s cubic-bezier(.22,1,.36,1)",
        pointerEvents: "none",
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
        {icon ?? <Send size={12} />}
      </span>
      <span>
        <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK, whiteSpace: "nowrap" }}>{title}</span>
        <span style={{ display: "block", fontSize: 9, color: FAINT, whiteSpace: "nowrap" }}>{sub}</span>
      </span>
    </div>
  );
}

/* ── Orchestration hook for one looping example ──────────────────── */

/**
 * Drives one looping demo: the `script` schedules state patches and cursor
 * moves on a Timeline, the loop restarts when it ends, playback pauses
 * offscreen, and prefers-reduced-motion renders the `final` tableau
 * statically (all transitions are suppressed via the .demo-root class).
 */
export function useExample<S extends object>(opts: {
  initial: S;
  final: S;
  script: (
    tl: Timeline,
    api: { set: (patch: Partial<S>) => void; cursor: React.RefObject<HeroCursorApi | null> },
  ) => number;
}) {
  const [st, setSt] = useState<S>(opts.initial);
  const cursorRef = useRef<HeroCursorApi | null>(null);
  const tl = useRef(new Timeline());
  const reducedRef = useRef(false);
  const playRef = useRef<() => void>(() => {});
  const optsRef = useRef(opts);

  // Latest-ref pattern, kept out of render per react-hooks/refs.
  useEffect(() => {
    optsRef.current = opts;
  });

  const play = useCallback(() => {
    tl.current.clear();
    setSt(optsRef.current.initial);
    const o = optsRef.current;
    const end = o.script(tl.current, {
      set: (patch) => setSt((s) => ({ ...s, ...patch })),
      cursor: cursorRef,
    });
    tl.current.at(end + 450, () => playRef.current());
  }, []);

  useEffect(() => {
    playRef.current = play;
  }, [play]);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const apply = () => {
      reducedRef.current = mq.matches;
      if (mq.matches) {
        tl.current.clear();
        setSt(optsRef.current.final);
      }
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  const viewRef = useDemoLifecycle(
    () => {
      if (!reducedRef.current) play();
    },
    () => {
      tl.current.clear();
      cursorRef.current?.hide();
      setSt(optsRef.current.initial);
    },
  );

  return { st, cursorRef, viewRef };
}

/* ── Small helpers ────────────────────────────────────────────────── */

export function Spinner({ size = 11 }: { size?: number }) {
  return (
    <span
      className="hero-spin"
      style={{ width: size, height: size, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }}
    />
  );
}

/** Skeleton text bars for dense document bodies (NDA clauses, contracts). */
export function Bar({ w, o = 1 }: { w: number; o?: number }) {
  return <span style={{ display: "block", height: 5, width: w, borderRadius: 3, background: "#e9e7e4", opacity: o }} />;
}

export { Check, Send, X };
