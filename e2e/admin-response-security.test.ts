import { describe, expect, test } from "bun:test";
import { publicAdminUser, publicAdminSettings } from "../src/lib/admin-serializers";

describe("admin response boundaries", () => {
  test("user projection excludes credentials and loaded relationships", () => {
    const result = publicAdminUser({
      id: "fixture-user", email: "fixture@example.test", firstName: "Fixture", lastName: "User",
      role: "MEMBER", status: "ACTIVE", totpEnabled: false, createdAt: new Date(0),
      passwordHash: "synthetic-password-hash", totpSecret: "synthetic-totp-secret",
      totpPendingSecret: "synthetic-pending-secret", totpRecoveryCodes: "synthetic-recovery-hashes",
      sessions: [{ id: "synthetic-session" }], futureCredential: "synthetic-future-secret",
    });
    expect(result.email).toBe("fixture@example.test");
    expect(result.createdAt).toBe("1970-01-01T00:00:00.000Z");
    for (const key of ["passwordHash", "totpSecret", "totpPendingSecret", "totpRecoveryCodes", "sessions", "futureCredential"]) {
      expect(Object.hasOwn(result, key)).toBe(false);
    }
  });

  test("settings projection excludes submission credentials and unknown fields", () => {
    const result = publicAdminSettings({
      id: "singleton", smtpHost: "relay.example.test", smtpPort: 587, smtpTls: true,
      smtpPassword: "synthetic-smtp-secret", futureCredential: "synthetic-future-secret",
      updatedAt: new Date(0),
    });
    expect(result!.smtpHost).toBe("relay.example.test");
    expect(Object.hasOwn(result!, "smtpPassword")).toBe(false);
    expect(Object.hasOwn(result!, "futureCredential")).toBe(false);
  });
});
