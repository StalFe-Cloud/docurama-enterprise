export type SigningEmailKind = "invite" | "reminder" | "copy" | "signed" | "completed";
export type SigningEmailInput = {
  kind: SigningEmailKind; locale?: string | null; title: string; senderName: string;
  recipientName?: string; message?: string | null; linkUrl: string;
};
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, char => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
}[char]!));
const singleLine = (value: string) => value.replace(/[\r\n\u0000-\u001f\u007f]+/g, " ").trim();

/** Presentation only: callers must authorize this private link and the envelope state. */
export function buildSigningEmail(input: SigningEmailInput) {
  const url = new URL(input.linkUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) throw new Error("Signing email requires an HTTP(S) link without credentials");
  const fr = /^fr(?:-|$)/i.test(input.locale ?? "");
  const title = singleLine(input.title);
  const sender = singleLine(input.senderName);
  const copy = fr ? {
    invite: ["Demande de signature", "Votre document est prêt", sender + " vous invite à vérifier et signer ce document.", "Vérifier et signer"],
    reminder: ["Rappel de signature", "Votre signature est attendue", "Ce document attend toujours votre signature.", "Vérifier et signer"],
    copy: ["Copie pour information", "Un document vous a été partagé", sender + " vous transmet ce document pour information. Aucune signature n’est requise de votre part.", "Voir le document"],
    signed: ["Signature enregistrée", "Merci pour votre signature", "Votre signature a été enregistrée. Le document reste en attente des autres signataires.", "Voir l’avancement"],
    completed: ["Terminé", "Tous les signataires ont signé", "Le processus de signature est terminé. Vous pouvez consulter le document final et son historique.", "Voir le document terminé"],
  } : {
    invite: ["Signature requested", "Your document is ready", sender + " invites you to review and sign this document.", "Review and sign"],
    reminder: ["Reminder", "Your signature is requested", "This document is still awaiting your signature.", "Review and sign"],
    copy: ["Copy for your records", "A document has been shared with you", sender + " shared this document for your information. No signature is required from you.", "View document"],
    signed: ["Signature recorded", "Thank you for signing", "Your signature has been recorded. This document is waiting for the remaining signers.", "View progress"],
    completed: ["Completed", "All signers have signed", "The signing process is complete. You can view the completed document and its history.", "View completed document"],
  };
  const [prefix, heading, description, action] = copy[input.kind];
  const greeting = input.recipientName ? (fr ? "Bonjour " : "Hello ") + input.recipientName + "," : fr ? "Bonjour," : "Hello,";
  const warning = fr
    ? "Ce lien est personnel. Ne transférez pas cet e-mail et ne partagez pas ce lien. Si vous ne reconnaissez pas cet envoi ou avez besoin d’aide, contactez directement l’expéditeur par un canal connu."
    : "This link is private. Do not forward this email or share the link. If you do not recognize this request or need help, contact the sender directly through a known channel.";
  const message = input.message?.trim();
  const senderLabel = fr ? "Expéditeur" : "Sender";
  const messageLabel = fr ? "Message de l’expéditeur" : "Message from the sender";
  const bodyText = [greeting, heading, title, description, senderLabel + ": " + sender,
    ...(message ? [messageLabel + ":\n" + message] : []), action + ": " + input.linkUrl, warning, "Docurama"].join("\n\n");
  const bodyHtml = '<!doctype html><html lang="' + (fr ? "fr" : "en") + '"><head><meta charset="utf-8"></head>'
    + '<body style="margin:0;background:#f3f4f6;color:#172033;font-family:Arial,sans-serif"><main style="max-width:600px;margin:24px auto;background:white;border-radius:12px;padding:32px">'
    + '<div style="font-size:20px;font-weight:700;color:#4f46e5">Docurama</div>'
    + '<p>' + escapeHtml(greeting) + '</p><h1 style="font-size:24px">' + escapeHtml(heading) + '</h1>'
    + '<h2 style="font-size:18px">' + escapeHtml(title) + '</h2><p>' + escapeHtml(description) + '</p>'
    + '<p><strong>' + senderLabel + ':</strong> ' + escapeHtml(sender) + '</p>'
    + (message ? '<div style="background:#f8fafc;border-left:3px solid #4f46e5;padding:16px"><strong>' + messageLabel + '</strong><p style="white-space:pre-wrap">' + escapeHtml(message) + '</p></div>' : '')
    + '<p style="margin:28px 0"><a href="' + escapeHtml(input.linkUrl) + '" style="display:inline-block;background:#4f46e5;color:white;text-decoration:none;padding:14px 22px;border-radius:6px;font-weight:700">' + escapeHtml(action) + '</a></p>'
    + '<p style="font-size:13px;color:#475569">' + escapeHtml(warning) + '</p>'
    + '<p style="font-size:12px;word-break:break-all"><a href="' + escapeHtml(input.linkUrl) + '">' + escapeHtml(input.linkUrl) + '</a></p></main></body></html>';
  const templates: Record<SigningEmailKind, string> = { invite: "SIGN_INVITE", reminder: "REMINDER", copy: "COPY_NOTICE", signed: "SIGN_RECEIPT", completed: "SIGN_COMPLETED" };
  return { subject: prefix + ": " + title, bodyText, bodyHtml, template: templates[input.kind], linkUrl: input.linkUrl };
}
