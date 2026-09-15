"use client";

/**
 * Spring-physics cursor for the marketing hero product movie.
 *
 * The cursor behaves like a human hand: it accelerates toward its target with
 * a slightly under-damped spring (natural overshoot, natural settle) instead
 * of linear tweening. Clicks emit an expanding ripple ring and a quick press
 * scale. A pen mode crossfades the arrow into a pen nib while the signature
 * is being drawn.
 *
 * Position updates happen through direct DOM writes inside a rAF loop, so the
 * cursor never triggers React re-renders while moving.
 */

export type HeroCursorApi = {
  /** Place the cursor at a point and fade it in. */
  show: (x: number, y: number) => void;
  /** Spring toward a new point. */
  moveTo: (x: number, y: number) => void;
  /** Ripple + press at the current position. */
  click: () => void;
  /** Swap between the arrow cursor and the pen nib. */
  setPen: (v: boolean) => void;
  /** Fade the cursor out. */
  hide: () => void;
};

import { forwardRef, useImperativeHandle, useRef, useState } from "react";
import { cn } from "@/lib/utils";

/** Slightly under-damped: gentle overshoot, ~500ms settle over 300-500px. */
const STIFFNESS = 170;
const DAMPING = 21;

export const HeroCursor = forwardRef<HeroCursorApi, { className?: string }>(function HeroCursor({ className }, ref) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [pen, setPen] = useState(false);
  const [pressed, setPressed] = useState(false);
  const [visible, setVisible] = useState(false);

  const pos = useRef({ x: 0, y: 0 });
  const vel = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);
  const raf = useRef(0);
  const running = useRef(false);
  const rippleId = useRef(0);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const apply = () => {
    if (elRef.current) elRef.current.style.transform = `translate3d(${pos.current.x}px, ${pos.current.y}px, 0)`;
  };

  const tick = () => {
    const dt = 1 / 60;
    const { x: px, y: py } = pos.current;
    const { x: tx, y: ty } = target.current;
    // Spring force toward the target + damping against velocity.
    const ax = -STIFFNESS * (px - tx) - DAMPING * vel.current.x;
    const ay = -STIFFNESS * (py - ty) - DAMPING * vel.current.y;
    vel.current.x += ax * dt;
    vel.current.y += ay * dt;
    pos.current.x += vel.current.x * dt;
    pos.current.y += vel.current.y * dt;
    apply();
    const settled =
      Math.abs(pos.current.x - tx) < 0.4 &&
      Math.abs(pos.current.y - ty) < 0.4 &&
      Math.abs(vel.current.x) < 6 &&
      Math.abs(vel.current.y) < 6;
    if (settled) {
      pos.current = { x: tx, y: ty };
      vel.current = { x: 0, y: 0 };
      apply();
      running.current = false;
      return;
    }
    raf.current = requestAnimationFrame(tick);
  };

  const kick = () => {
    if (running.current) return;
    running.current = true;
    raf.current = requestAnimationFrame(tick);
  };

  useImperativeHandle(ref, () => ({
    show(x, y) {
      pos.current = { x, y };
      target.current = { x, y };
      vel.current = { x: 0, y: 0 };
      apply();
      setVisible(true);
    },
    moveTo(x, y) {
      target.current = { x, y };
      kick();
    },
    click() {
      const id = ++rippleId.current;
      setRipples((r) => [...r, { id, x: pos.current.x, y: pos.current.y }]);
      setPressed(true);
      if (pressTimer.current) clearTimeout(pressTimer.current);
      pressTimer.current = setTimeout(() => setPressed(false), 170);
      setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 700);
    },
    setPen(v) {
      setPen(v);
    },
    hide() {
      setVisible(false);
    },
  }));

  return (
    <>
      {/* Ripple layer at canvas coordinates */}
      <div className={cn("pointer-events-none absolute inset-0 z-40", className)} aria-hidden>
        {ripples.map((r) => (
          <span key={r.id} className="hero-ripple" style={{ left: r.x, top: r.y }} />
        ))}
      </div>
      {/* The cursor itself: direct transform writes from the rAF loop */}
      <div
        ref={elRef}
        aria-hidden
        className="pointer-events-none absolute left-0 top-0 z-50 will-change-transform"
        style={{
          opacity: visible ? 1 : 0,
          transition: "opacity .45s ease",
        }}
      >
        <div
          style={{
            transform: `scale(${pressed ? 0.82 : 1}) ${pen ? "rotate(-6deg)" : ""}`,
            transition: "transform .16s cubic-bezier(.34,1.56,.64,1)",
            filter: "drop-shadow(0 2px 5px rgba(26,26,26,.28))",
          }}
          className="relative h-[26px] w-[22px]"
        >
          {/* Arrow */}
          <svg
            width="22"
            height="26"
            viewBox="0 0 22 26"
            className="absolute left-0 top-0"
            style={{ opacity: pen ? 0 : 1, transition: "opacity .18s ease" }}
          >
            <path
              d="M2 1.5 L2 20.5 L6.8 16.1 L9.7 23.2 L12.7 21.9 L9.8 15.2 L16.2 14.7 Z"
              fill="#1a1a1a"
              stroke="#ffffff"
              strokeWidth="1.4"
              strokeLinejoin="round"
            />
          </svg>
          {/* Pen nib for signature drawing */}
          <svg
            width="22"
            height="26"
            viewBox="0 0 24 28"
            className="absolute left-0 top-0"
            style={{ opacity: pen ? 1 : 0, transition: "opacity .18s ease" }}
          >
            <path
              d="M4 24 L6.5 15.5 L16.5 3.5 C17.5 2.3 19.4 2.6 20 4 C20.6 5.4 19.6 7 18.1 7.1 L8 17 Z"
              fill="#1a1a1a"
              stroke="#ffffff"
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <circle cx="7.2" cy="19.5" r="1.1" fill="#ffffff" />
          </svg>
        </div>
      </div>
    </>
  );
});
