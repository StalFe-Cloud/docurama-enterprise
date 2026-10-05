"use client";

/**
 * Scene layers for the hero product movie. Pure presentational components
 * driven by the orchestrator's timeline state. All coordinates are logical
 * pixels inside the fixed 1000 x 600 demo canvas.
 *
 * Illustrates the supported product flow with synthetic values: the New envelope dialog fields, the signing
 * page with signature adoption, and the cryptographic evidence drawer from
 * the documents table.
 */

import { useEffect, useState } from "react";
import { Check, Lock, Mail, PenLine, Send, X } from "lucide-react";
import { cn } from "@/lib/utils";

const INK = "#1a1a1a";
const MUTED = "#787671";
const FAINT = "#a8a29e";
const HAIR = "#e5e3df";
const SOFT = "#f6f5f4";
const EMERALD = "#0f7a5a";
const EMERALD_SOFT = "#dff3eb";
const SUCCESS = "#1a7f37";
const SUCCESS_SOFT = "#d9f3e1";
const INFO = "#0075de";
const INFO_SOFT = "#dcecfa";

export const HERO_EMAIL = "lars@nordjarm.example";
export const HERO_HASH = "9f2c7e41a8b3d6f0c2e5a7d8";

/* ─────────────────────────── Status chip ─────────────────────────── */

export function DemoChip({ status, pop }: { status: string; pop?: string }) {
  const style: Record<string, { bg: string; fg: string; label: string }> = {
    DRAFT: { bg: SOFT, fg: MUTED, label: "Draft" },
    SENT: { bg: INFO_SOFT, fg: INFO, label: "Sent" },
    PARTIALLY_SIGNED: { bg: "#f9e79f", fg: "#9a5b00", label: "Partially signed" },
    COMPLETED: { bg: SUCCESS_SOFT, fg: SUCCESS, label: "Completed" },
    SIGNED: { bg: SUCCESS_SOFT, fg: SUCCESS, label: "Signed" },
  };
  const s = style[status] ?? style.DRAFT;
  return (
    <span
      key={pop ?? status}
      className={cn("hero-chip-pop inline-flex h-[22px] items-center rounded-md px-2 text-[10.5px] font-semibold", pop && "hero-chip-pop")}
      style={{ background: s.bg, color: s.fg }}
    >
      {s.label}
    </span>
  );
}

/* ─────────────────────── New envelope dialog ─────────────────────── */

export function NewEnvelopeModal({
  open, typed, emailFocus, sending, valid,
}: {
  open: boolean;
  typed: string;
  emailFocus: boolean;
  sending: boolean;
  valid: boolean;
}) {
  return (
    <div
      aria-hidden
      className="absolute z-30"
      style={{
        left: 56, top: 44, right: 0, bottom: 0,
        background: "rgba(26,26,26,0.32)",
        backdropFilter: "blur(2px)",
        opacity: open ? 1 : 0,
        transition: "opacity .22s ease",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute", left: 192, top: 78, width: 560, height: 428,
          background: "#ffffff", borderRadius: 14, border: `1px solid ${HAIR}`,
          boxShadow: "0 24px 64px -16px rgba(26,26,26,.28), 0 2px 6px rgba(26,26,26,.08)",
          opacity: open ? 1 : 0,
          transform: open ? "scale(1) translateY(0)" : "scale(0.965) translateY(8px)",
          transition: "opacity .24s ease, transform .3s cubic-bezier(.22,1,.36,1)",
        }}
      >
        <p style={{ ...label(0), fontSize: 14, fontWeight: 600, color: INK, left: 24, top: 20 }}>Send a document for signature</p>
        <p style={{ ...label(0), left: 24, top: 42, fontSize: 10.5, color: MUTED, fontWeight: 400 }}>
          Recipients receive a personal signing link. Each token is unique.
        </p>

        <p style={{ ...label(0), left: 24, top: 76 }}>Document title</p>
        <div style={inputBox(24, 90, 512)}>
          <span style={{ fontSize: 11, color: INK }}>EN 10204 3.1 Mill Certificate · S355J2 Plates</span>
        </div>

        <p style={{ ...label(0), left: 24, top: 134 }}>Recipients (sign in routing order)</p>
        <div style={{ ...inputBox(24, 148, 168) }}>
          <span style={{ fontSize: 11, color: INK }}>Lars Bergström</span>
        </div>
        <div
          style={{
            ...inputBox(202, 148, 270),
            borderColor: emailFocus ? EMERALD : HAIR,
            boxShadow: emailFocus ? "0 0 0 3px rgba(15,122,90,.14)" : "none",
            transition: "border-color .15s ease, box-shadow .15s ease",
          }}
        >
          <span style={{ fontSize: 11, color: typed ? INK : FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>
            {typed || "name@company.com"}
            {emailFocus && <span className="hero-caret" style={{ color: EMERALD }}>|</span>}
          </span>
        </div>
        {/* trash glyph */}
        <svg width="13" height="13" viewBox="0 0 24 24" style={{ position: "absolute", left: 486, top: 158, color: FAINT }} fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
        </svg>

        <p style={{ ...label(0), left: 24, top: 196 }}>Message to signers</p>
        <div style={{ ...inputBox(24, 210, 512), height: 46 }}>
          <span style={{ fontSize: 10.5, color: MUTED }}>Please review and sign at your earliest convenience.</span>
        </div>

        <div style={{ position: "absolute", right: 24, bottom: 22, display: "flex", gap: 10 }}>
          <div style={{ ...btnOutline(), width: 70 }}>Cancel</div>
          <div
            style={{
              ...btnPrimary(),
              width: sending ? 118 : 150,
              background: valid ? EMERALD : "#8fb8aa",
              transition: "background .25s ease, width .2s ease",
            }}
          >
            {sending ? (
              <>
                <span className="hero-spin" style={{ width: 11, height: 11, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} />
                <span>Sending…</span>
              </>
            ) : (
              <>
                <Send size={12} strokeWidth={2.2} />
                <span>Send to 1 recipient</span>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function label(top: number) {
  return {
    position: "absolute" as const,
    left: 0, top,
    fontSize: 10, fontWeight: 600, color: "#37352f",
    letterSpacing: ".01em",
  };
}

function inputBox(left: number, top: number, width: number) {
  return {
    position: "absolute" as const,
    left, top, width, height: 30,
    background: "#ffffff",
    border: `1px solid ${HAIR}`,
    borderRadius: 8,
    display: "flex", alignItems: "center",
    paddingLeft: 10, paddingRight: 8,
  };
}

function btnPrimary() {
  return {
    height: 32, borderRadius: 8, background: EMERALD, color: "#fff",
    display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
    fontSize: 11, fontWeight: 600,
    boxShadow: "0 1px 2px rgba(15,122,90,.3)",
  };
}

function btnOutline() {
  return {
    height: 32, borderRadius: 8, background: "#fff", color: INK,
    border: `1px solid ${HAIR}`,
    display: "flex", alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 500,
  };
}

/* ───────────────────── Signer view (scene B) ───────────────────── */

const SIGNATURE_STROKES: { d: string; delay: number; dur: number }[] = [
  // The "L"
  { d: "M 8,38 C 6,26 7,12 12,6 C 14,4 17,5 17,9 C 17,15 13,26 9,34 C 8,36 9,38 12,37 C 18,35 24,31 29,26", delay: 0, dur: 300 },
  // "ars" connected cursive
  { d: "M 38,36 C 35,34 34,30 37,27 C 40,24 45,26 46,30 C 47,34 44,37 41,36 C 46,38 51,35 53,29 C 55,24 58,23 60,27 C 62,31 60,35 64,33 C 70,30 72,23 77,21 C 81,19 83,25 88,23 C 93,21 96,27 102,25 C 108,23 111,17 117,19 C 122,21 121,27 127,27 C 132,27 135,22 140,20", delay: 340, dur: 470 },
  // The "B" of Bergström
  { d: "M 150,34 C 147,26 148,12 153,6 C 155,3 158,4 158,8 C 158,14 155,24 151,32 C 150,34 151,35 154,34 C 159,32 164,29 165,24 C 166,20 163,17 159,19 C 155,21 153,26 152,31", delay: 860, dur: 290 },
  // underline flourish
  { d: "M 14,42 C 40,39 80,41 105,38 C 122,36 138,36 150,32", delay: 1180, dur: 170 },
];

export function SignerScene({ visible, sigFocus, signing, signed, adopting, adoptReady }: {
  visible: boolean;
  sigFocus: boolean;
  signing: boolean;
  signed: boolean;
  adopting: boolean;
  adoptReady: boolean;
}) {
  return (
    <div
      aria-hidden
      className="absolute z-10"
      style={{
        left: 56, top: 44, right: 0, bottom: 0, background: "#fafaf9",
        opacity: visible ? 1 : 0,
        transform: visible ? "none" : "translateX(18px)",
        transition: "opacity .3s ease, transform .3s ease",
        pointerEvents: "none",
      }}
    >
      {/* Header strip */}
      <p style={{ position: "absolute", left: 20, top: 14, fontSize: 10.5, color: MUTED }}>
        Signing <span style={{ color: INK, fontWeight: 600 }}>EN 10204 3.1 Mill Certificate · S355J2 Plates</span>
      </p>
      <p style={{ position: "absolute", right: 20, top: 14, fontSize: 10, color: FAINT }}>
        Signer 1 of 1 · Lars Bergström
      </p>

      {/* Paper stack + page */}
      <div style={{ position: "absolute", left: 152, top: 44, width: 402, height: 424 }}>
        <div style={{ position: "absolute", inset: 0, transform: "translate(4px,4px) rotate(.35deg)", background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6 }} />
        <div style={{ position: "absolute", inset: 0, transform: "translate(2px,2px) rotate(.15deg)", background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6 }} />
        <div
          style={{
            position: "absolute", inset: 0, background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 6,
            boxShadow: "0 8px 24px -12px rgba(26,26,26,.18)",
            transform: signed ? "scale(1.012)" : "scale(1)",
            transition: "transform .25s cubic-bezier(.34,1.56,.64,1)",
          }}
        >
          {/* Letterhead: the real StålFe mark */}
          <div style={{ position: "absolute", left: 20, top: 16, display: "flex", alignItems: "center", gap: 8 }}>
            <img src="/brand/stalfe-mark.png" alt="" width={23} height={27} style={{ display: "block" }} />
            <span>
              <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: "#14284b", lineHeight: 1.05, letterSpacing: ".01em" }}>StålFe</span>
              <span style={{ display: "block", fontSize: 7, color: FAINT, letterSpacing: ".14em", marginTop: 1 }}>FOUNDRY &amp; INDUSTRIAL SUPPLY CHAIN</span>
            </span>
          </div>
          <p style={{ position: "absolute", right: 20, top: 20, fontSize: 8, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>EN 10204 · TYPE 3.1</p>

          <p style={{ position: "absolute", left: 0, right: 0, top: 62, textAlign: "center", fontSize: 12.5, fontWeight: 700, letterSpacing: ".08em", color: INK }}>
            MILL TEST CERTIFICATE 3.1
          </p>
          <p style={{ position: "absolute", left: 0, right: 0, top: 78, textAlign: "center", fontSize: 8.5, color: MUTED }}>
            EN 10204 · S355J2 structural steel plates · 24 plates · 6.4 t · Order PO-2026-0417
          </p>

          {/* Chemistry table */}
          <div style={{ position: "absolute", left: 20, right: 20, top: 98 }}>
            {[
              ["HEAT NO.", "C %", "MN %", "SI %", "YIELD MPA"],
              ["H-22190", "0.17", "1.42", "0.24", "385"],
              ["H-22191", "0.18", "1.38", "0.22", "379"],
              ["H-22192", "0.16", "1.45", "0.26", "391"],
            ].map((row, i) => (
              <div
                key={i}
                style={{
                  display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr 1fr 1.1fr",
                  padding: "5px 8px",
                  background: i === 0 ? SOFT : "#fff",
                  borderBottom: `1px solid ${i === 3 ? "transparent" : "#f0eeec"}`,
                  fontSize: i === 0 ? 7.5 : 9,
                  fontWeight: i === 0 ? 700 : 400,
                  color: i === 0 ? MUTED : INK,
                  fontFamily: i === 0 ? "inherit" : "var(--font-geist-mono), monospace",
                  letterSpacing: ".04em",
                }}
              >
                {row.map((cell, j) => <span key={j} style={{ textAlign: j === 0 ? "left" : "right" }}>{cell}</span>)}
              </div>
            ))}
          </div>

          <p style={{ position: "absolute", left: 20, top: 212, fontSize: 8.5, color: MUTED }}>
            Issued by Nordjärm Gjuteri AB · Quality Department · Works certificate no. MC-4471-3.1
          </p>

          {/* Date + signature field */}
          <div style={{ position: "absolute", left: 20, top: 244, fontSize: 8, color: FAINT, letterSpacing: ".05em" }}>DATE</div>
          <div style={{ position: "absolute", left: 20, top: 254, fontSize: 10, color: INK, fontFamily: "var(--font-geist-mono), monospace" }}>2026-09-15</div>

          <div style={{ position: "absolute", right: 20, top: 244, fontSize: 8, color: FAINT, letterSpacing: ".05em", textAlign: "right" }}>
            SIGNATURE · LARS BERGSTRÖM
          </div>
          <div
            style={{
              position: "absolute", right: 20, top: 254, width: 190, height: 56,
              border: `1.5px dashed ${sigFocus || signing ? EMERALD : "#d1d1d1"}`,
              borderRadius: 8,
              background: sigFocus || signing ? "rgba(15,122,90,.03)" : "#fff",
              transition: "border-color .2s ease, background .2s ease",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <svg width="170" height="46" viewBox="0 0 170 46" fill="none">
              {SIGNATURE_STROKES.map((s, i) => (
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
                    strokeDashoffset: signing ? 0 : 1,
                    transition: `stroke-dashoffset ${s.dur}ms cubic-bezier(.45,.05,.35,1) ${s.delay}ms`,
                  }}
                />
              ))}
            </svg>
          </div>

          {/* SIGNED stamp on the page */}
          {signed && (
            <div style={{ position: "absolute", right: 26, top: 34 }}>
              <div
                className="hero-stamp"
                style={{ "--stamp-rot": "9deg", width: 74, height: 74, borderRadius: "50%", border: `2.5px solid ${SUCCESS}`, color: SUCCESS, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1, background: "rgba(217,243,225,.5)" } as React.CSSProperties}
              >
                <Check size={16} strokeWidth={3} />
                <span style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: ".16em" }}>SIGNED</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Signing bar */}
      <div
        style={{
          position: "absolute", left: 0, right: 0, bottom: 0, height: 62,
          background: "#fff", borderTop: `1px solid ${HAIR}`,
          display: "flex", alignItems: "center", paddingLeft: 20, paddingRight: 16, gap: 10,
        }}
      >
        <span style={{ width: 28, height: 28, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, fontSize: 10, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>LB</span>
        <span>
          <span style={{ display: "block", fontSize: 11, fontWeight: 600, color: INK }}>Signing as Lars Bergström</span>
          <span style={{ display: "block", fontSize: 9, color: FAINT }}>
            lars@nordjarm.example · access through a personal signing link
          </span>
        </span>
        <span style={{ marginLeft: "auto", display: "flex", gap: 10, alignItems: "center" }}>
          <span style={{ fontSize: 11, color: MUTED }}>Decline</span>
          <span
            style={{
              ...btnPrimary(),
              width: 132,
              background: adoptReady ? EMERALD : "#b9c9c2",
              transition: "background .3s ease",
            }}
          >
            {adopting ? (
              <>
                <span className="hero-spin" style={{ width: 11, height: 11, border: "2px solid rgba(255,255,255,.35)", borderTopColor: "#fff", borderRadius: "50%", display: "inline-block" }} />
                <span>Sealing…</span>
              </>
            ) : (
              <>
                <PenLine size={12} strokeWidth={2.2} />
                <span>Adopt and sign</span>
              </>
            )}
          </span>
        </span>
      </div>
    </div>
  );
}

/* ─────────────────── Evidence drawer (scene C) ─────────────────── */

export function EvidenceDrawer({ open, hash, audit }: { open: boolean; hash: string; audit: boolean }) {
  const auditRows: [string, string][] = [
    ["envelope created", "Alexandra Fischer · StålFe"],
    ["sent", "Docurama · signing invitation queued"],
    ["viewed", "Lars Bergström · Nordjärm Gjuteri"],
    ["signed", "Lars Bergström · typed-name adoption"],
    ["sealed", "Docurama · completion evidence recorded"],
  ];
  return (
    <aside
      aria-hidden
      style={{
        position: "absolute", right: 0, top: 0, bottom: 0, width: 352,
        background: "#fff", borderLeft: `1px solid ${HAIR}`,
        boxShadow: "-24px 0 56px -24px rgba(26,26,26,.3), -2px 0 6px rgba(26,26,26,.05)",
        transform: open ? "translateX(0)" : "translateX(352px)",
        transition: "transform .34s cubic-bezier(.22,1,.36,1)",
        pointerEvents: "none", zIndex: 25,
        padding: "20px 22px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: INK }}>Cryptographic evidence</p>
        <X size={14} color={FAINT} />
      </div>
      <p style={{ fontSize: 9.5, color: FAINT, fontFamily: "var(--font-geist-mono), monospace", marginTop: 3 }}>DOC-8P4K2M</p>

      <div style={{ height: 1, background: HAIR, margin: "14px 0" }} />

      {([
        ["Sealed", "Sep 15, 2026 · 08:41 CET"],
        ["Signing method", null],
        ["SHA-256 digest", null],
        ["Time source", "Application clock"],
      ] as const).map(([k, v], i) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5.5px 0" }}>
          <span style={{ fontSize: 10.5, color: MUTED }}>{k}</span>
          {v ? (
            <span style={{ fontSize: 10.5, color: INK }}>{v}</span>
          ) : k === "Signing method" ? (
            <span style={{ background: EMERALD_SOFT, color: EMERALD, fontSize: 9.5, fontWeight: 700, borderRadius: 5, padding: "2px 7px" }}>Email link</span>
          ) : (
            <span style={{ fontSize: 10, color: INK, fontFamily: "var(--font-geist-mono), monospace", maxWidth: 190, overflow: "hidden", whiteSpace: "nowrap" }}>
              {hash || "…"}
              {open && hash.length < HERO_HASH.length && <span className="hero-caret" style={{ color: EMERALD }}>|</span>}
            </span>
          )}
        </div>
      ))}

      <p style={{ fontSize: 11, fontWeight: 600, color: INK, marginTop: 16 }}>Signers</p>
      <div style={{ border: `1px solid ${HAIR}`, borderRadius: 9, padding: "9px 11px", marginTop: 7, display: "flex", alignItems: "center", gap: 9 }}>
        <span style={{ width: 24, height: 24, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, fontSize: 9, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>1</span>
        <span style={{ minWidth: 0 }}>
          <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK }}>Lars Bergström</span>
          <span style={{ display: "block", fontSize: 9, color: FAINT, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>lars@nordjarm.example · personal signing link</span>
        </span>
        <span style={{ marginLeft: "auto", textAlign: "right" }}>
          <DemoChip status="SIGNED" />
          <span style={{ display: "block", fontSize: 8.5, color: FAINT, marginTop: 2 }}>08:40 CET</span>
        </span>
      </div>

      <p style={{ fontSize: 11, fontWeight: 600, color: INK, marginTop: 16 }}>Audit trail</p>
      <ol style={{ position: "relative", marginLeft: 4, borderLeft: `1.5px solid ${HAIR}`, marginTop: 8 }}>
        {auditRows.map(([action, meta], i) => (
          <li key={action} style={{ position: "relative", paddingLeft: 16, marginBottom: 10 }}>
            <span
              className={audit ? "hero-dot-in" : undefined}
              style={{
                position: "absolute", left: -5.75, top: 2,
                width: 9, height: 9, borderRadius: "50%",
                background: audit ? EMERALD : SOFT,
                border: `2px solid ${audit ? EMERALD : "#d1d1d1"}`,
                transitionDelay: audit ? `${i * 90}ms` : "0ms",
              }}
            />
            <p style={{ fontSize: 10.5, fontWeight: 500, color: INK, textTransform: "capitalize" }}>{action}</p>
            <p style={{ fontSize: 8.5, color: FAINT }}>{meta}</p>
          </li>
        ))}
      </ol>

      <div style={{ display: "flex", alignItems: "center", gap: 7, marginTop: 4, color: MUTED }}>
        <Lock size={10} />
        <span style={{ fontSize: 8.5, lineHeight: 1.5 }}>
          The digest is derived from the sealed file itself and can be re-verified at any time on the public portal.
        </span>
      </div>
    </aside>
  );
}

/* ─────────────────────── Toast + seal stamp ─────────────────────── */

export function DemoToast({ open }: { open: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        position: "absolute", right: 22, bottom: 18, zIndex: 45,
        display: "flex", alignItems: "center", gap: 10,
        background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 10,
        padding: "10px 14px",
        boxShadow: "0 12px 32px -8px rgba(26,26,26,.24)",
        opacity: open ? 1 : 0,
        transform: open ? "translateY(0)" : "translateY(12px)",
        transition: "opacity .3s ease, transform .3s cubic-bezier(.22,1,.36,1)",
      }}
    >
      <span style={{ width: 26, height: 26, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
        <Mail size={12} />
      </span>
      <span>
        <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK }}>Invitation sent</span>
        <span style={{ display: "block", fontSize: 9, color: FAINT }}>lars@nordjarm.example · unique signing link</span>
      </span>
    </div>
  );
}

export function SealStamp({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <div aria-hidden style={{ position: "absolute", left: 596, top: 168, zIndex: 30, pointerEvents: "none" }}>
      <div style={{ position: "absolute", inset: -14 }}>
        <span className="hero-impact" style={{ position: "absolute", inset: 0, borderRadius: "50%", border: `2px solid rgba(15,122,90,.45)` }} />
      </div>
      <div
        className="hero-stamp"
        style={{
          "--stamp-rot": "-9deg",
          width: 84, height: 84, borderRadius: "50%",
          border: `2.5px solid ${EMERALD}`,
          color: EMERALD,
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
          background: "radial-gradient(circle at 32% 28%, rgba(255,255,255,.55), rgba(223,243,235,.72) 68%), rgba(223,243,235,.65)",
          boxShadow: "inset 0 0 0 4px rgba(15,122,90,.09), inset 0 2px 10px rgba(15,122,90,.12), 0 2px 8px rgba(15,122,90,.15)",
        } as React.CSSProperties}
      >
        <span style={{ width: 62, height: 62, borderRadius: "50%", border: `1.5px dashed rgba(15,122,90,.55)`, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 1 }}>
          <Check size={15} strokeWidth={3} />
          <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: ".18em" }}>SEALED</span>
          <span style={{ fontSize: 6, fontFamily: "var(--font-geist-mono), monospace", letterSpacing: ".08em" }}>2026·09·15</span>
        </span>
      </div>
    </div>
  );
}
