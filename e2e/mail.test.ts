/// <reference types="bun-types" />

/**
 * Mail delivery engine E2E — src/lib/mail.ts against a local fake SMTP
 * relay (node:net) and a scratch database, hermetic: no egress, no shared
 * state with the other suites.
 *
 * Run: DATABASE_URL=file:/tmp/… bun test e2e/mail.test.ts
 * (run.sh wires it with a fresh copy of the committed db — this file MUST
 * run in its own process because it mutates SMTP_URL, which is read at
 * call time by design.)
 *
 * Covers the three behaviours operators depend on:
 *  1. outbox-only mode (no SMTP_URL) keeps mail QUEUED and inspectable;
 *  2. a configured relay drains the queue, marking rows SENT;
 *  3. failures retry with backoff, become due, and terminally FAIL after
 *     5 attempts — the ledger always tells the truth about delivery.
 */

import { describe, expect, test, beforeAll, afterAll } from "bun:test";
import net from "node:net";
import { PrismaClient } from "@prisma/client";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/* ── A miniature SMTP relay ───────────────────────────────────────────────── */

type CapturedMail = { from: string; to: string[]; subject: string; body: string };

function startFakeSmtp() {
  const captured: CapturedMail[] = [];
  let rejectNext = 0; // >0: answer MAIL FROM with a 4xx this many times
  const control = {
    captured,
    rejectNextMailFrom: (n: number) => (rejectNext = n),
    port: 0 as number,
    close: () => Promise.resolve(),
  };

  const server = net.createServer((socket) => {
    let inData = false;
    let buffer = "";
    let current: Partial<CapturedMail> = {};

    const send = (line: string) => socket.write(`${line}\r\n`);
    send("220 mock-relay ESMTP ready");

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let idx: number;
      while ((idx = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 2);
        handleLine(line);
      }
    });

    function handleLine(line: string) {
      if (inData) {
        if (line === ".") {
          inData = false;
          captured.push({
            from: current.from ?? "",
            to: current.to ?? [],
            subject: current.subject ?? "",
            body: current.body ?? "",
          });
          current = {};
          send("250 message accepted");
        } else {
          // Un-dot-stuff and accumulate headers/body.
          const text = line.startsWith("..") ? line.slice(1) : line;
          if (!current.body && text === "") current.body = ""; // header/body separator
          else if (current.body !== undefined) current.body += (current.body ? "\n" : "") + text;
          else {
            const m = /^(Subject|From):\s*(.*)$/i.exec(text);
            if (m?.[1]?.toLowerCase() === "subject") current.subject = m[2];
            if (m?.[1]?.toLowerCase() === "from") current.from = m[2];
          }
        }
        return;
      }
      const cmd = line.toUpperCase();
      if (cmd.startsWith("EHLO") || cmd.startsWith("HELO")) {
        socket.write("250-mock-relay\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n");
      } else if (cmd.startsWith("AUTH PLAIN")) {
        send("235 authenticated");
      } else if (cmd.startsWith("AUTH LOGIN")) {
        send("334 VXNlcm5hbWU6"); // "Username:"
      } else if (cmd.startsWith("MAIL FROM")) {
        if (rejectNext > 0) {
          rejectNext--;
          send("450 mailbox temporarily unavailable");
        } else {
          send("250 ok");
        }
      } else if (cmd.startsWith("RCPT TO")) {
        const m = /^RCPT TO:<([^>]+)>/i.exec(line);
        if (m) current.to = [...(current.to ?? []), m[1]];
        send("250 ok");
      } else if (cmd.startsWith("DATA")) {
        inData = true;
        send("354 end data with <CR><LF>.<CR><LF>");
      } else if (cmd.startsWith("QUIT")) {
        send("221 bye");
        socket.end();
      } else if (cmd.startsWith("RSET")) {
        current = {};
        send("250 ok");
      } else {
        send("250 ok");
      }
    }
  });

  return new Promise<typeof control>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address() as { port: number };
      control.port = addr.port;
      control.close = () =>
        new Promise<void>((done) => server.close(() => done()));
      resolve(control);
    });
  });
}

/* ── Scratch database + lib under test ─────────────────────────────────────── */

const FIXTURE = process.env.E2E_FIXTURE_DB;
if (!FIXTURE) throw new Error("Mail E2E requires the migrated scratch fixture from e2e/run.sh");
const SCRATCH_DIR = mkdtempSync(join(tmpdir(), "docurama-mail-test-"));
const SCRATCH = join(SCRATCH_DIR, "scratch.db").replaceAll("\\", "/");
cpSync(FIXTURE, SCRATCH);

// Both clients must agree on the file: the lib's shared @/lib/db reads
// process.env at import time, so pin it BEFORE the dynamic import. This is
// why the file runs in its own process (run.sh) — it owns the environment.
process.env.DATABASE_URL = `file:${SCRATCH}`;
const db = new PrismaClient({ datasources: { db: { url: `file:${SCRATCH}` } } });
// The committed demo db carries fixture mail — this suite owns the outbox
// completely, so every count is exact.
await db.mailOutbox.deleteMany({});

const { processOutbox, smtpMode, mailBackoffMs, MAX_MAIL_ATTEMPTS } = await import("../src/lib/mail");

let relay: Awaited<ReturnType<typeof startFakeSmtp>>;

beforeAll(async () => {
  relay = await startFakeSmtp();
});

afterAll(async () => {
  await relay.close();
  await db.$disconnect();
  await (await import("../src/lib/db")).db.$disconnect();
  rmSync(SCRATCH_DIR, { recursive: true, force: true });
});

const queueMail = (subject: string) =>
  db.mailOutbox.create({
    data: {
      toEmail: "signer@example.com",
      template: "SIGN_INVITE",
      subject,
      bodyText: `Hello,\n\nPlease sign: ${subject}\n`,
      status: "QUEUED",
    },
  });

describe("SMTP_URL parsing (smtpMode)", () => {
  test("unset → outbox-only", () => {
    const prev = process.env.SMTP_URL;
    delete process.env.SMTP_URL;
    expect(smtpMode().configured).toBe(false);
    process.env.SMTP_URL = prev;
  });

  test("smtp:// and smtps:// parse; ?tls=off disables STARTTLS; garbage degrades", () => {
    process.env.SMTP_URL = "smtp://u:p@relay.example.com:587";
    const a = smtpMode();
    expect(a.configured).toBe(true);
    if (a.configured) {
      expect(a.url.hostname).toBe("relay.example.com");
      expect(a.tls).toBe(true);
    }
    process.env.SMTP_URL = "smtps://u:p@relay.example.com";
    expect(smtpMode().configured).toBe(true);
    process.env.SMTP_URL = "smtp://u:p@127.0.0.1:25?tls=off";
    const c = smtpMode();
    expect(c.configured).toBe(true);
    if (c.configured) expect(c.tls).toBe(false);
    process.env.SMTP_URL = "not a url at all";
    expect(smtpMode().configured).toBe(false);
    delete process.env.SMTP_URL;
  });
});

describe("outbox-only mode (no SMTP_URL)", () => {
  test("processOutbox is a no-op and rows stay QUEUED", async () => {
    const m = await queueMail("Outbox-only test");
    const res = await processOutbox(10);
    expect(res.mode).toBe("outbox-only");
    expect(res.processed).toBe(0);
    const row = await db.mailOutbox.findUnique({ where: { id: m.id } });
    expect(row?.status).toBe("QUEUED"); // inspectable in admin, not dropped
    await db.mailOutbox.delete({ where: { id: m.id } });
  });
});

describe("SMTP delivery", () => {
  test("queued mail is delivered and marked SENT", async () => {
    process.env.SMTP_URL = `smtp://tester:secret@127.0.0.1:${relay.port}?tls=off`;
    const m = await queueMail("Invite: NDA review");
    const res = await processOutbox(10);
    expect(res.mode).toBe("smtp");
    expect(res.sent).toBe(1);

    const row = await db.mailOutbox.findUnique({ where: { id: m.id } });
    expect(row?.status).toBe("SENT");
    expect(row?.sentAt).toBeTruthy();
    expect(row?.attempts).toBe(1);

    const got = relay.captured.find((c) => c.subject.includes("NDA"));
    expect(got).toBeDefined();
    expect(got?.to).toContain("signer@example.com");
    expect(got?.body).toContain("Please sign");
  });

  test("temporary failure → backoff, not-due rows are deferred, then recovery sends", async () => {
    const m = await queueMail("Retry me once");
    relay.rejectNextMailFrom(1);

    const first = await processOutbox(10);
    expect(first.sent).toBe(0);
    expect(first.deferred).toBe(1);
    let row = await db.mailOutbox.findUnique({ where: { id: m.id } });
    expect(row?.status).toBe("QUEUED");
    expect(row?.attempts).toBe(1);
    expect(row?.lastError).toContain("450");
    expect(row?.nextAttemptAt).not.toBeNull();
    expect(row!.nextAttemptAt!.getTime()).toBeGreaterThan(Date.now());

    // Not due yet → the next pass skips it entirely.
    const second = await processOutbox(10);
    expect(second.processed).toBe(0);

    // Simulate elapsed backoff time, then deliver on the retry.
    await db.mailOutbox.update({
      where: { id: m.id },
      data: { nextAttemptAt: new Date(Date.now() - 1000) },
    });
    const third = await processOutbox(10);
    expect(third.sent).toBe(1);
    row = await db.mailOutbox.findUnique({ where: { id: m.id } });
    expect(row?.status).toBe("SENT");
    expect(row?.attempts).toBe(2);
  });

  test("five failures terminally FAIL the message with the last error kept", async () => {
    const m = await queueMail("Never deliverable");
    relay.rejectNextMailFrom(99); // always reject

    for (let i = 1; i <= MAX_MAIL_ATTEMPTS; i++) {
      const res = await processOutbox(10);
      expect(res.failed + res.deferred).toBe(1);
      const row = await db.mailOutbox.findUnique({ where: { id: m.id } });
      expect(row?.attempts).toBe(i);
      if (i < MAX_MAIL_ATTEMPTS) {
        expect(row?.status).toBe("QUEUED");
        // Force the backoff due before the next attempt.
        await db.mailOutbox.update({
          where: { id: m.id },
          data: { nextAttemptAt: new Date(Date.now() - 1000) },
        });
      } else {
        expect(row?.status).toBe("FAILED");
        expect(row?.lastError).toContain("450");
      }
    }

    // Terminal state: no further attempts even when due time passes.
    const again = await processOutbox(10);
    expect(again.processed).toBe(0);
  });

  test("backoff schedule is capped at 30 minutes", () => {
    expect(mailBackoffMs(1)).toBe(30_000);
    expect(mailBackoffMs(2)).toBe(120_000);
    expect(mailBackoffMs(3)).toBe(480_000);
    expect(mailBackoffMs(4)).toBe(1_800_000);
    expect(mailBackoffMs(5)).toBe(1_800_000); // cap
  });
});
