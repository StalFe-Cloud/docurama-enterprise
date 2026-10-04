import { expect, test } from "bun:test";
import net from "node:net";
import { buildSigningEmail } from "../src/lib/signing-email";
import { sendViaSmtp } from "../src/lib/mail";

test("SMTP relay receives HTML and plain text with a stable retry message ID", async () => {
  const messages: string[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer(socket => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = "", data = false, message = "";
    socket.write("220 synthetic relay\r\n");
    socket.on("data", chunk => {
      buffer += chunk.toString();
      let end: number;
      while ((end = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { messages.push(message); message = ""; data = false; socket.write("250 accepted\r\n"); }
          else message += line + "\r\n";
        } else if (/^EHLO|^HELO/i.test(line)) socket.write("250 synthetic relay\r\n");
        else if (/^DATA/i.test(line)) { data = true; socket.write("354 continue\r\n"); }
        else if (/^QUIT/i.test(line)) { socket.end("221 goodbye\r\n"); }
        else socket.write("250 ok\r\n");
      }
    });
  });
  try {
    await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
    const address = server.address() as net.AddressInfo;
    const mode = { configured: true as const, url: new URL("smtp://127.0.0.1:" + address.port + "?tls=off"), tls: false };
    const content = buildSigningEmail({ kind: "invite", locale: "en", title: "Synthetic document", senderName: "Synthetic sender", linkUrl: "http://127.0.0.1:12345/sign/synthetic" });
    const mail = { ...content, id: "synthetic-email", fromEmail: "sender@example.invalid", toEmail: "recipient@example.invalid" };
    await sendViaSmtp(mode, mail);
    await sendViaSmtp(mode, mail);
    expect(messages).toHaveLength(2);
    for (const message of messages) {
      expect(message).toContain("multipart/alternative");
      expect(message).toContain("text/plain");
      expect(message).toContain("text/html");
      expect(message).toContain("Review and sign");
      expect(message).toContain("Message-ID: <synthetic-email@outbox.docurama>");
    }
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
