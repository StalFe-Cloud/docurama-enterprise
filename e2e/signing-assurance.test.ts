import { beforeEach, expect, mock, test } from "bun:test";
import { NextRequest } from "next/server";
import type { SessionUser } from "../src/lib/auth";
import { signerAuthenticationRestriction, signatureAssuranceRestriction } from "../src/lib/signing-policy";
import { ESIGN_LEVELS } from "../src/lib/esign";

// Standalone process: synthetic persistence only, no database, provider or SMTP.
let existing: Record<string, unknown> | null;
let writes: Record<string, unknown>[];
let audits = 0;
let beforeUpdate: (() => void) | null = null;
mock.module("../src/lib/db", () => ({ db: {
  user: { findUnique: async () => ({ id: "synthetic-admin" }) },
  esignPreferences: {
    findUnique: async () => existing,
    upsert: async ({ update, create }: { update: Record<string, unknown>; create: Record<string, unknown> }) => {
      if (existing && Object.keys(update).length === 0) return existing; // Empty upsert is an existing-row read.
      const saved = existing ? { ...existing, ...update } : create;
      writes.push(saved); existing = saved; return saved;
    },
    update: async ({ data }: { data: Record<string, unknown> }) => {
      beforeUpdate?.(); beforeUpdate = null;
      const saved = { ...existing, ...data }; writes.push(saved); existing = saved; return saved;
    },
  },
} }));
mock.module("../src/lib/auth", () => ({
  hashPasswordAsync: async () => "synthetic-unused",
  verifyPasswordAsync: async () => false,
  recordAudit: async () => { audits++; },
}));
const { postSettingsOp } = await import("../src/lib/settings-handlers");
const administrator = { id: "synthetic-admin", firstName: "Synthetic", lastName: "Admin",
  tenantId: "synthetic-tenant", tenantSlug: "synthetic", tenantName: "Synthetic", workspaceRole: "OWNER", role: "WORKSPACE_ADMIN" } as unknown as SessionUser;
const save = (data: Record<string, unknown>, me = administrator) => postSettingsOp(me,
  { op: "esign.save", data: { filenameFormat: "{title}", ...data } }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
beforeEach(() => { existing = null; writes = []; audits = 0; beforeUpdate = null; });

test("only email-link typed signing is a selectable supported assurance", () => {
  expect(ESIGN_LEVELS.map(level => level.key)).toEqual(["simple"]);
  expect(signatureAssuranceRestriction("simple")).toBeNull();
  for (const level of ["advanced", "qualified", "unknown", null, undefined]) expect(signatureAssuranceRestriction(level)).toContain("unsupported");
});
test("existing stronger assurance and signer reauthentication fail closed", () => {
  for (const signatureLevel of ["advanced", "qualified", "unknown"]) {
    expect(signerAuthenticationRestriction({ status: "ACTIVE", esignPrefs: { signatureLevel, requireReauth: false, part11Mode: false } })).toContain("administrator");
  }
  for (const flags of [{ requireReauth: true, part11Mode: false }, { requireReauth: false, part11Mode: true }]) {
    expect(signerAuthenticationRestriction({ status: "ACTIVE", esignPrefs: { signatureLevel: "simple", ...flags } })).toContain("reauthentication");
  }
});
test("unsupported writes return explicit errors without persistence or audit success", async () => {
  for (const signatureLevel of ["advanced", "qualified", "unknown", null]) {
    const response = await save({ signatureLevel });
    expect(response.status).toBe(422);
    expect((await response.json()).error).toContain("unsupported");
  }
  expect(writes).toHaveLength(0); expect(audits).toBe(0);
});
test("omitting assurance never downgrades an existing stronger policy", async () => {
  for (const signatureLevel of ["advanced", "qualified"]) {
    existing = { signatureLevel, requireReauth: false, part11Mode: false };
    expect((await save({})).status).toBe(422);
    expect(existing.signatureLevel).toBe(signatureLevel);
  }
  expect(writes).toHaveLength(0);
});
test("explicit administrator review selects simple while omitted stronger controls remain", async () => {
  const consentText = "Synthetic workspace agreement preserved for explicit electronic signing consent.";
  existing = { signatureLevel: "advanced", requireReauth: true, part11Mode: true, consentText };
  expect((await save({ signatureLevel: "simple" })).status).toBe(200);
  expect(writes[0].signatureLevel).toBe("simple");
  expect(writes[0].requireReauth).toBe(true); expect(writes[0].part11Mode).toBe(true);
  expect(writes[0].consentText).toBe(consentText); expect(audits).toBe(1);
});
test("fresh preferences choose supported mode and members cannot change assurance", async () => {
  expect((await save({})).status).toBe(200); expect(writes[0].signatureLevel).toBe("simple");
  writes = [];
  expect((await save({ signatureLevel: "simple" }, { ...administrator, workspaceRole: "MEMBER" })).status).toBe(403);
  expect(writes).toHaveLength(0);
});
test("missing Part 11 body preserves authentication restrictions and trusted consent", async () => {
  const consentText = "Synthetic trusted agreement preserved when authentication settings are omitted.";
  existing = { signatureLevel: "simple", requireReauth: true, part11Mode: true, consentText, consentVersion: "synthetic-v1" };
  const response = await postSettingsOp(administrator, { op: "part11.save" }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
  expect(response.status).toBe(200);
  expect(existing.requireReauth).toBe(true); expect(existing.part11Mode).toBe(true);
  expect(existing.consentText).toBe(consentText);
  expect((await response.json()).message).toContain("does not claim Part 11 compliance");
});

for (const op of ["esign.save", "part11.save"]) {
  test(`${op} stores the exact trusted consent wording and explicit version`, async () => {
    const consentText = "  Synthetic agreement wording with deliberate whitespace.\nThe signer reviews this exact text.  ";
    existing = { signatureLevel: "simple", requireReauth: false, part11Mode: false, consentText: "Previous agreement", consentVersion: "fixture-v1" };
    const response = await postSettingsOp(administrator, { op, data: { filenameFormat: "{title}", consentText, consentVersion: "fixture-v2" } }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
    expect(response.status).toBe(200);
    expect(existing.consentText).toBe(consentText); expect(existing.consentVersion).toBe("fixture-v2");
  });
  test(`${op} rejects malformed restrictions or consent without weakening stored policy`, async () => {
    const trusted = { signatureLevel: "simple", requireReauth: true, part11Mode: true,
      consentText: "Synthetic trusted consent wording preserved across rejected administrative inputs.", consentVersion: "fixture-v1" };
    for (const data of [{ requireReauth: null }, { part11Mode: "false" }, { consentText: 42 },
      { consentText: "x".repeat(16 * 1024 + 1) }, { consentText: "bad\0terms" },
      { consentVersion: null }, { consentVersion: "" }, { consentVersion: "invalid\nversion" },
      { consentVersion: "é".repeat(65) }]) {
      existing = { ...trusted };
      const response = await postSettingsOp(administrator, { op, data: { filenameFormat: "{title}", ...data } }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
      expect(response.status).toBe(422);
      expect(existing).toEqual(trusted);
    }
    expect(writes).toHaveLength(0); expect(audits).toBe(0);
  });
}
test("omitted Part 11 preferences preserve concurrent changes at the write boundary", async () => {
  existing = { signatureLevel: "simple", requireReauth: false, part11Mode: false, consentText: "Earlier agreement", consentVersion: "earlier-v1" };
  beforeUpdate = () => { existing = { ...existing, requireReauth: true, part11Mode: true,
    consentText: "Concurrent administrator agreement that must not be overwritten by an omitted body.", consentVersion: "concurrent-v2" }; };
  const response = await postSettingsOp(administrator, { op: "part11.save" }, new NextRequest("http://127.0.0.1/api/workspace/settings"));
  expect(response.status).toBe(200);
  expect(existing.requireReauth).toBe(true); expect(existing.part11Mode).toBe(true);
  expect(existing.consentText).toContain("Concurrent administrator"); expect(existing.consentVersion).toBe("concurrent-v2");
});
