import { describe, expect, test } from "bun:test";
import { buildSigningEmail } from "../src/lib/signing-email";

const input = { title: 'Agreement <script>alert(1)</script>', senderName: 'Sender & Co', recipientName: 'Synthetic recipient', message: 'Please review.\n<script>unsafe</script>', linkUrl: 'http://127.0.0.1:49123/sign/synthetic?x=1&y=2' };
describe("signing email presentation", () => {
  test("French invite escapes content, preserves message and private review link", () => {
    const mail = buildSigningEmail({ ...input, kind: "invite", locale: "fr-FR" });
    expect(mail.template).toBe("SIGN_INVITE");
    expect(mail.subject).toContain("signature");
    expect(mail.bodyText).toContain(input.message);
    expect(mail.bodyText).toContain(input.linkUrl);
    expect(mail.bodyHtml).toContain('lang="fr"');
    expect(mail.bodyHtml).toContain("Vérifier et signer");
    expect(mail.bodyHtml).toContain("&lt;script&gt;");
    expect(mail.bodyHtml).not.toContain("<script>");
    expect(mail.bodyHtml).toContain("Sender &amp; Co");
    expect(mail.bodyHtml).toContain("personnel");
  });
  test("receipt waits for others while completion accurately states everyone signed", () => {
    const signed = buildSigningEmail({ ...input, kind: "signed", locale: "fr" });
    const done = buildSigningEmail({ ...input, kind: "completed", locale: "en" });
    expect(signed.bodyText).toContain("attente");
    expect(signed.template).toBe("SIGN_RECEIPT");
    expect(done.subject).toStartWith("Completed:");
    expect(done.bodyText).toContain("All signers");
    expect(done.bodyHtml).toContain("View completed document");
    expect(done.bodyText).not.toContain("attached");
  });
  test("copy and reminder use role-appropriate actions and fallback locale", () => {
    expect(buildSigningEmail({ ...input, kind: "copy" }).bodyText).toContain("No signature is required");
    expect(buildSigningEmail({ ...input, kind: "reminder", locale: "en-US" }).subject).toStartWith("Reminder:");
    expect(buildSigningEmail({ ...input, kind: "invite", locale: "de" }).bodyHtml).toContain('lang="en"');
  });
  test("rejects unsafe links and subject header injection", () => {
    for (const linkUrl of ["javascript:alert(1)", "data:text/html,test", "//evil.invalid", "https://user:pass@example.invalid/"]) {
      expect(() => buildSigningEmail({ ...input, kind: "invite", linkUrl })).toThrow();
    }
    const mail = buildSigningEmail({ ...input, title: "Title\r\nBcc: attacker", kind: "invite" });
    expect(mail.subject).not.toMatch(/[\r\n]/);
  });
});
