import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { freezeConsentTerms, readConsentSnapshot, resolveConsentTerms } from "../src/lib/consent";
import { captureSignatureData, readSignatureData } from "../src/lib/signature-data";
import { PublicSign, type SignPageState } from "../src/components/marketing/public-sign";

const preferences = { consentText: "  I reviewed these exact terms.\nI agree to the recorded electronic signature.  ", consentVersion: "contract-policy-v3" };
const terms = resolveConsentTerms(preferences);
const acknowledgement = { name: "Synthetic Signer", consent: true, consentDigest: terms.digest, consentVersion: terms.version };
const capture = (body: Record<string, unknown> = acknowledgement) => captureSignatureData(body, [], "signer@example.test", new Date(1000), terms);

describe("immutable server-resolved signer consent", () => {
  test("frozen custom wording/version survive later preference changes and are captured exactly", () => {
    const mutable = { ...preferences };
    const snapshot = freezeConsentTerms(mutable);
    mutable.consentText = "New later policy"; mutable.consentVersion = "v4";
    expect(readConsentSnapshot(snapshot)).toEqual(terms);
    const proof = capture();
    expect(proof.version).toBe(2);
    expect(proof.consent).toBe(preferences.consentText);
    expect(proof.consentVersion).toBe(preferences.consentVersion);
    expect(proof.consentDigest).toBe(terms.digest);
    expect(readSignatureData(JSON.stringify(proof))).toEqual(proof);
  });
  test("no missing, stale or client-authoritative acknowledgement can be captured", () => {
    for (const change of [{ consent: false }, { consentDigest: undefined }, { consentVersion: undefined },
      { consentDigest: "0".repeat(64) }, { consentVersion: "older-version" }, { consentText: "Forged client wording" }]) {
      expect(() => capture({ ...acknowledgement, ...change })).toThrow();
    }
    expect(() => captureSignatureData(acknowledgement, [], "signer@example.test", new Date(1000),
      { ...terms, text: "Server object altered without its digest" })).toThrow();
  });
  test("changed and malformed frozen snapshots fail closed", () => {
    for (const raw of [null, "not json", "[]", "{}", JSON.stringify({ ...terms, schema: 2 }),
      JSON.stringify({ ...terms, text: terms.text + "changed" }), JSON.stringify({ ...terms, version: "other" })]) {
      expect(() => readConsentSnapshot(raw)).toThrow();
    }
  });
  test("text/version limits and version controls are validated independently", () => {
    for (const consentText of ["", "  ", "x\0y", "é".repeat(8193)]) {
      expect(() => resolveConsentTerms({ ...preferences, consentText })).toThrow();
    }
    for (const consentVersion of ["", " ", "v\r\nInjected", "v".repeat(129)]) {
      expect(() => resolveConsentTerms({ ...preferences, consentVersion })).toThrow();
    }
    expect(resolveConsentTerms(null).version).toBe("v1.0");
  });
  test("historically accepted v1 wording remains verbatim without backfilled version/digest", () => {
    const historical = { version: 1, name: "Historical Signer", font: "caveat", consent: "Earlier accepted wording exactly.",
      consentAcceptedAt: new Date(0).toISOString(), authMethod: "EMAIL_LINK", values: {} } as const;
    expect(readSignatureData(JSON.stringify(historical))).toEqual(historical);
    expect(readSignatureData(JSON.stringify(historical)).consentVersion).toBeUndefined();
    expect(() => readSignatureData(JSON.stringify({ ...capture(), consent: "Rewritten accepted text" }))).toThrow();
  });
  test("actual active React label displays only the server-frozen exact wording and version", () => {
    const state: SignPageState = { phase: "active", consent: terms, title: "Synthetic terms", code: "DOC-SYNTHETIC", tenantName: "Synthetic tenant",
      message: null, pages: 1, senderName: "Synthetic tenant", senderDomainVerified: null, recipientName: "Synthetic Signer",
      recipientEmail: "signer@example.test", signers: [], bodyMarkdown: null, document: null, fields: [] };
    const html = renderToStaticMarkup(createElement(PublicSign, { token: "synthetic-only", state }));
    expect(html).toContain(preferences.consentText);
    expect(html).toContain("Consent version: ");
    expect(html).toContain(preferences.consentVersion);
    expect(html).not.toContain("My typed name and signing activity will be recorded");
  });
});
