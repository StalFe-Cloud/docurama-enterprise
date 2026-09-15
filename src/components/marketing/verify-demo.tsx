"use client";

/**
 * Live bento demo · the public verification portal.
 *
 * Anyone can check a sealed document's code without an account: the code
 * is typed, the portal checks it, and the verified result reveals the
 * document title, its SHA-256 digest, the signers and the seal level.
 */

import { BadgeCheck, FileSearch, Lock } from "lucide-react";
import {
  DemoCanvas, HeroCursor, INK, MUTED, FAINT, HAIR, SOFT, WORKSPACE, EMERALD,
  EMERALD_SOFT, SUCCESS, SUCCESS_SOFT, Spinner, btnPrimary, useExample,
} from "./demo-kit";

const W = 780;
const H = 400;

const CODE = "DOC-00HPLC60";
const HASH = "a3f8c2e91d7b4f6a0e5c8d2b";

type State = {
  in: boolean;
  focus: boolean;
  typed: string;
  checking: boolean;
  result: boolean;
  digest: string;
  signers: boolean;
  exit: boolean;
};

const INITIAL: State = {
  in: false, focus: false, typed: "", checking: false, result: false,
  digest: "", signers: false, exit: false,
};

const FINAL: State = {
  ...INITIAL, in: true, typed: CODE, result: true, digest: HASH, signers: true,
};

export function VerifyDemo() {
  const { st, cursorRef, viewRef } = useExample({
    initial: INITIAL,
    final: FINAL,
    script: (tl, { set, cursor }) => {
      tl.at(300, () => set({ in: true }));
      tl.at(1300, () => cursor.current?.show(200, 190));
      tl.at(1450, () => cursor.current?.moveTo(330, 172));       // code input
      tl.at(2150, () => { cursor.current?.click(); set({ focus: true }); });
      const typedEnd = tl.typeText(2400, CODE, (s) => set({ typed: s }), 46, 40);
      tl.at(typedEnd + 420, () => cursor.current?.moveTo(598, 172)); // Verify
      tl.at(typedEnd + 1150, () => { cursor.current?.click(); set({ checking: true, focus: false }); });
      tl.at(typedEnd + 2250, () => set({ checking: false, result: true }));
      const hashEnd = tl.typeText(typedEnd + 2650, HASH, (s) => set({ digest: s }), 24, 20);
      tl.at(hashEnd + 600, () => set({ signers: true }));
      tl.at(hashEnd + 1000, () => cursor.current?.hide());
      tl.at(hashEnd + 3600, () => set({ exit: true }));
      return hashEnd + 4050;
    },
  });

  return (
    <div ref={viewRef} className="demo-root">
      <DemoCanvas
        w={W} h={H}
        label="Live example of the public verification portal: a sealed document's code is entered, and the result shows its title, SHA-256 digest, signers and seal level, without an account and without exposing the file."
      >
        <div style={{ position: "absolute", inset: 0, background: WORKSPACE, opacity: st.exit ? 0 : 1, transition: "opacity .4s ease" }}>
          {/* Portal header */}
          <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 48, background: "#fff", borderBottom: `1px solid ${HAIR}`, display: "flex", alignItems: "center", paddingLeft: 20, paddingRight: 20, gap: 8 }}>
            <span style={{ width: 20, height: 20, borderRadius: 6, background: EMERALD, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <Lock size={11} strokeWidth={2.6} />
            </span>
            <span style={{ fontSize: 12, fontWeight: 600, color: INK }}>Docurama Verify</span>
            <span style={{ marginLeft: "auto", fontSize: 9, color: FAINT, fontFamily: "var(--font-geist-mono), monospace" }}>verify.docurama.eu</span>
          </div>

          {/* Center card */}
          <div
            style={{
              position: "absolute", left: "50%", top: 92, width: 460,
              transform: `translateX(-50%) ${st.result ? "translateY(-16px)" : "translateY(0)"}`,
              transition: "transform .4s cubic-bezier(.22,1,.36,1)",
              opacity: st.in ? 1 : 0,
            }}
          >
            <div style={{ textAlign: "center" }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: INK, letterSpacing: "-.01em" }}>Verify a document</p>
              <p style={{ fontSize: 9.5, color: MUTED, marginTop: 3 }}>
                Enter the verification code printed on the sealed copy.
              </p>
            </div>

            {/* Input row */}
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <div
                style={{
                  flex: 1, height: 36, borderRadius: 9,
                  border: `1px solid ${st.focus ? EMERALD : HAIR}`,
                  background: "#fff",
                  boxShadow: st.focus ? "0 0 0 3px rgba(15,122,90,.14)" : "none",
                  display: "flex", alignItems: "center", paddingLeft: 12,
                  transition: "border-color .15s ease, box-shadow .15s ease",
                }}
              >
                <span style={{ fontSize: 11, color: st.typed ? INK : FAINT, fontFamily: "var(--font-geist-mono), monospace", letterSpacing: ".04em" }}>
                  {st.typed || "e.g. DOC-00HPLC60"}
                  {st.focus && <span className="hero-caret" style={{ color: EMERALD }}>|</span>}
                </span>
              </div>
              <span
                style={{
                  ...btnPrimary(),
                  width: st.checking ? 96 : 84,
                  transform: st.checking ? "scale(.965)" : "scale(1)",
                  transition: "transform .14s ease, width .2s ease",
                }}
              >
                {st.checking ? (
                  <><Spinner /><span>Checking…</span></>
                ) : (
                  <FileSearch size={12} strokeWidth={2.3} />
                )}
                {!st.checking && <span>Verify</span>}
              </span>
            </div>

            <p style={{ textAlign: "center", fontSize: 8.5, color: FAINT, marginTop: 10 }}>
              No account needed. The code never exposes the file itself.
            </p>
          </div>

          {/* Result card */}
          <div
            style={{
              position: "absolute", left: "50%", top: 196, width: 500,
              transform: "translateX(-50%)",
              opacity: st.result ? 1 : 0,
              marginTop: st.result ? 0 : 10,
              transition: "opacity .35s ease, margin-top .4s cubic-bezier(.22,1,.36,1)",
            }}
          >
            <div style={{ background: "#fff", border: `1px solid ${HAIR}`, borderRadius: 12, padding: "14px 18px", boxShadow: "0 16px 40px -20px rgba(26,26,26,.24)" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="hero-chip-pop" style={{ width: 34, height: 34, borderRadius: "50%", background: SUCCESS_SOFT, color: SUCCESS, display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <BadgeCheck size={17} strokeWidth={2.6} />
                </span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 12, fontWeight: 700, color: SUCCESS, letterSpacing: ".05em" }}>VERIFIED</span>
                  <span style={{ display: "block", fontSize: 10.5, fontWeight: 600, color: INK, marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    Foundry Partner Qualification · Nordjärm Gjuteri AB
                  </span>
                </span>
                <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 700, borderRadius: 5, padding: "2px 7px", background: EMERALD_SOFT, color: EMERALD, flexShrink: 0 }}>PAdES B-LT</span>
              </div>

              <div style={{ height: 1, background: HAIR, margin: "11px 0" }} />

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 18px" }}>
                <div>
                  <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", color: FAINT }}>SEALED</p>
                  <p style={{ fontSize: 9.5, color: INK, fontFamily: "var(--font-geist-mono), monospace", marginTop: 2 }}>Sep 2, 2026 · 10:14 CET</p>
                </div>
                <div>
                  <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", color: FAINT }}>TIMESTAMP</p>
                  <p style={{ fontSize: 9.5, color: INK, fontFamily: "var(--font-geist-mono), monospace", marginTop: 2 }}>RFC 3161 · DigiCert</p>
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <p style={{ fontSize: 8, fontWeight: 700, letterSpacing: ".08em", color: FAINT }}>SHA-256 DIGEST</p>
                  <p style={{ fontSize: 9.5, color: INK, fontFamily: "var(--font-geist-mono), monospace", marginTop: 2 }}>
                    {st.digest || "…"}
                    {st.digest.length > 0 && st.digest.length < HASH.length && <span className="hero-caret" style={{ color: EMERALD }}>|</span>}
                  </p>
                </div>
              </div>

              <div style={{ height: 1, background: HAIR, margin: "11px 0" }} />

              <div
                style={{
                  display: "flex", alignItems: "center", gap: 9,
                  opacity: st.signers ? 1 : 0,
                  transform: st.signers ? "none" : "translateY(4px)",
                  transition: "opacity .35s ease, transform .35s ease",
                }}
              >
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: EMERALD_SOFT, color: EMERALD, fontSize: 8, fontWeight: 700, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>LB</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: "block", fontSize: 10, fontWeight: 600, color: INK }}>Lars Bergström</span>
                  <span style={{ display: "block", fontSize: 8.5, color: FAINT }}>Nordjärm Gjuteri AB · signed Sep 2 · 10:12 CET</span>
                </span>
                <span style={{ marginLeft: "auto", fontSize: 8.5, fontWeight: 700, color: SUCCESS, background: SUCCESS_SOFT, borderRadius: 5, padding: "2px 7px" }}>SIGNED</span>
              </div>
            </div>
          </div>

          <p style={{ position: "absolute", left: 0, right: 0, bottom: 10, textAlign: "center", fontSize: 8, color: FAINT }}>
            The digest is derived from the sealed file and can be re-verified at any time.
          </p>
        </div>
        <HeroCursor ref={cursorRef} />
      </DemoCanvas>
    </div>
  );
}
