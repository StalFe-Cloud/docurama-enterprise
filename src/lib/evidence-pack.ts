/**
 * Evidence pack — the portable, self-verifying proof of a completed envelope.
 *
 * One ZIP per completed envelope (roadmap #1):
 *
 *   manifest.json                     signed manifest (canonical JSON + RSA)
 *   README.txt                        bilingual instructions
 *   verify.html                       offline verifier — browser, no server
 *   CERTIFICATE-OF-COMPLETION.html    human proof, print-to-PDF ready (FR/EN)
 *   document/<file>                   the sealed artefact, byte-exact
 *   evidence/event-ledger.csv         the complete event ledger
 *   evidence/envelope.json            machine-readable envelope record
 *   certificate/evidence-key.pem      the signing certificate (DNS-SAN when the
 *                                     tenant verified its sending domain)
 *   certificate/evidence-key.pub.pem  SPKI public key used to verify
 *
 * The manifest lists every artifact with its SHA-256 and is signed by the
 * tenant evidence key (see src/lib/evidence-key.ts). verify.html re-hashes
 * every artifact in the browser and checks the signature with WebCrypto, so a
 * third party can validate the pack with zero Docurama infrastructure — the
 * answer to "what if the instance is gone in ten years?".
 */

import { createHash } from "crypto";
import { db } from "@/lib/db";
import { zipStore, type ZipEntry } from "@/lib/zip";
import { canonicalJson } from "@/lib/canonical-json";
import { getOrCreateEvidenceKey, signPayload, EVIDENCE_SIGNATURE_ALGORITHM } from "@/lib/evidence-key";
import { readStoredBytes } from "@/lib/document-store";
import {
  appendSealCommitment, getChainSegment, signCheckpoint,
  TRANSPARENCY_FORMAT, type PackTransparencyBlock,
} from "@/lib/transparency";

export const EVIDENCE_PACK_FORMAT = "docurama-evidence-pack";
export const EVIDENCE_PACK_VERSION = 1;

export class EvidencePackError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const escapeHtml = (s: string) =>
  s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** CSV cell escaping per RFC 4180. */
const csvCell = (s: string | null | undefined) => {
  const v = s ?? "";
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
};

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

const fmtFr = (d: Date | null | undefined) =>
  d
    ? d.toLocaleString("fr-FR", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" }) + " UTC"
    : "—";

const fmtEn = (d: Date | null | undefined) =>
  d
    ? d.toLocaleString("en-GB", { timeZone: "UTC", dateStyle: "long", timeStyle: "short" }) + " UTC"
    : "—";

type FullEnvelope = NonNullable<Awaited<ReturnType<typeof loadEnvelope>>>;

async function loadEnvelope(key: string, tenantId: string) {
  return db.envelope.findFirst({
    where: { tenantId, OR: [{ id: key }, { publicCode: key.toUpperCase() }] },
    include: {
      recipients: { orderBy: { order: "asc" } },
      events: { orderBy: { at: "asc" } },
      tenant: { select: { name: true } },
      document: true,
      template: { select: { name: true, bodyMarkdown: true } },
      createdBy: { select: { firstName: true, lastName: true, email: true } },
    },
  });
}

/* ── Bilingual print-ready certificate ─────────────────────────────────────── */

function renderCertificateHtml(e: FullEnvelope): string {
  const signers = e.recipients.filter((r) => r.role === "SIGNER");
  const signed = signers.filter((r) => r.status === "SIGNED");
  const rows = signers
    .map(
      (r) =>
        `<tr><td>${escapeHtml(r.name)}</td><td>${escapeHtml(r.email)}</td><td>${escapeHtml(String(r.order))}</td>` +
        `<td>${r.signedAt ? escapeHtml(fmtFr(r.signedAt)) : "—"}</td>` +
        `<td>${r.signedAt ? escapeHtml(fmtEn(r.signedAt)) : "—"}</td></tr>`,
    )
    .join("");

  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Certificat de signature — ${escapeHtml(e.publicCode)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; color: #0f172a; margin: 0; background: #f1f5f9; }
  .page { max-width: 820px; margin: 24px auto; background: #fff; padding: 48px 56px; border: 1px solid #e2e8f0; border-radius: 8px; }
  header { border-bottom: 3px solid #1e3a8a; padding-bottom: 16px; margin-bottom: 24px; display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; }
  h1 { font-size: 22px; margin: 0; }
  .sub { color: #475569; font-size: 13px; margin-top: 4px; }
  .code { font-family: ui-monospace, monospace; font-size: 16px; background: #eef2ff; border: 1px solid #c7d2fe; border-radius: 6px; padding: 6px 12px; white-space: nowrap; }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .08em; color: #1e3a8a; margin: 28px 0 10px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { text-align: left; padding: 8px 10px; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
  th { background: #f8fafc; font-weight: 600; color: #334155; }
  .digest { font-family: ui-monospace, monospace; font-size: 12px; word-break: break-all; background: #f8fafc; padding: 10px 12px; border: 1px solid #e2e8f0; border-radius: 6px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; font-size: 13px; }
  .meta div b { color: #334155; font-weight: 600; display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .05em; }
  .badge { display: inline-block; border-radius: 999px; padding: 2px 10px; font-size: 12px; font-weight: 600; }
  .badge.ok { background: #dcfce7; color: #14532d; border: 1px solid #86efac; }
  footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 11.5px; line-height: 1.6; }
  .en { color: #64748b; }
  @media print {
    body { background: #fff; }
    .page { margin: 0; border: none; border-radius: 0; padding: 24px 8mm; max-width: none; }
  }
</style>
</head>
<body>
<div class="page">
  <header>
    <div>
      <h1>Certificat de signature électronique</h1>
      <h1 class="en" style="font-size:15px;font-weight:500">Electronic signature certificate</h1>
    </div>
    <div class="code">${escapeHtml(e.publicCode)}</div>
  </header>

  <div class="meta">
    <div><b>Document</b>${escapeHtml(e.title)}</div>
    <div><b>Organisation / Organization</b>${escapeHtml(e.tenant.name)}</div>
    <div><b>Expéditeur / Sender</b>${escapeHtml(`${e.createdBy.firstName} ${e.createdBy.lastName}`)} &lt;${escapeHtml(e.createdBy.email)}&gt;</div>
    <div><b>Statut / Status</b>${escapeHtml(e.status)}${e.conformanceLevel ? ` · PAdES ${escapeHtml(e.conformanceLevel)}` : ""}</div>
    <div><b>Scellé le / Sealed on</b>${escapeHtml(fmtFr(e.sealedAt))}<span class="en"> (${escapeHtml(fmtEn(e.sealedAt))})</span></div>
    <div><b>Pages</b>${escapeHtml(String(e.pages))}</div>
  </div>

  ${e.verifiedSenderDomain ? `<p style="margin-top:14px"><span class="badge ok">Domaine expéditeur vérifié par DNS TXT · Sender domain verified via DNS TXT : ${escapeHtml(e.verifiedSenderDomain)}</span></p>` : ""}

  <h2>Signataires · Signers</h2>
  <table>
    <thead><tr><th>Nom / Name</th><th>Email</th><th>Ordre / Order</th><th>Signé le (FR)</th><th>Signed at (EN)</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
  <p class="sub">${signed.length}/${signers.length} signataire(s) ont signé · ${signed.length}/${signers.length} signer(s) completed</p>

  <h2>Preuve cryptographique · Cryptographic evidence</h2>
  <p class="sub">Empreinte SHA-256 du document scellé (calculée à la signature et vérifiable sur le portail public verify.docurama.eu) ·
  SHA-256 digest of the sealed document (computed at sealing time, verifiable on the public portal):</p>
  <div class="digest">${escapeHtml(e.sha256 ?? "")}</div>

  <h2>Piste d'audit · Audit trail</h2>
  <p class="sub">${e.events.length} événement(s) horodatés enregistré(s) — détail complet dans <code>evidence/event-ledger.csv</code> ·
  ${e.events.length} timestamped event(s) recorded — full detail in <code>evidence/event-ledger.csv</code>.</p>

  <footer>
    <p><b>Honnêteté de conformance · Compliance honesty.</b>
    Docurama n'est pas un prestataire qualifié (QTSP) au sens du règlement eIDAS. Le niveau de conformance indiqué
    reflète exactement les mécanismes appliqués (SES / AdES / alignement QES, PAdES ${escapeHtml(e.conformanceLevel ?? "B-T")}).
    &nbsp;<span class="en">Docurama is not a qualified trust service provider under eIDAS. The stated conformance level reflects
    exactly the mechanisms applied; it is a conformance claim, not a qualified-seal claim.</span></p>
    <p>Docurama SAS · 1 Rue Marguerin, 75014 Paris, France · docurama.eu — Généré le / Generated on ${escapeHtml(fmtFr(new Date()))}</p>
  </footer>
</div>
</body>
</html>`;
}

/* ── Offline verifier (mirrors src/lib/canonical-json.ts byte for byte) ─────── */

function renderVerifyHtml(): string {
  return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Docurama — Vérification hors ligne / Offline verification</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", system-ui, -apple-system, sans-serif; background: #f1f5f9; color: #0f172a; margin: 0; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 32px 20px 64px; }
  header { border-bottom: 3px solid #1e3a8a; padding-bottom: 14px; margin-bottom: 22px; }
  h1 { font-size: 20px; margin: 0; }
  .sub { color: #475569; font-size: 13px; margin-top: 6px; line-height: 1.6; }
  .drop { background: #fff; border: 2px dashed #94a3b8; border-radius: 10px; padding: 28px; text-align: center; margin: 18px 0; }
  .drop.over { border-color: #1e3a8a; background: #eef2ff; }
  input[type=file] { font: inherit; }
  .banner { border-radius: 8px; padding: 14px 16px; font-weight: 600; margin: 16px 0; font-size: 15px; }
  .ok { background: #dcfce7; color: #14532d; border: 1px solid #86efac; }
  .bad { background: #fee2e2; color: #7f1d1d; border: 1px solid #fca5a5; }
  table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; font-size: 13px; }
  th, td { text-align: left; padding: 8px 12px; border-bottom: 1px solid #e2e8f0; }
  th { background: #f8fafc; }
  td.mono { font-family: ui-monospace, monospace; font-size: 11px; word-break: break-all; }
  .tag { display: inline-block; border-radius: 999px; padding: 1px 10px; font-size: 11px; font-weight: 700; }
  .tag.ok { background: #dcfce7; color: #14532d; }
  .tag.bad { background: #fee2e2; color: #7f1d1d; }
  .meta { background: #fff; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; font-size: 13px; line-height: 1.8; margin-top: 16px; }
  .foot { color: #64748b; font-size: 11.5px; margin-top: 20px; line-height: 1.6; }
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>Docurama — Vérification hors ligne du dossier de preuve</h1>
    <p class="sub">Offline evidence-pack verification · Aucune donnée ne quitte cet ordinateur — aucune requête réseau n'est émise.
    <br>Nothing leaves this computer — no network request is made.</p>
  </header>

  <div class="drop" id="drop">
    <p><b>1.</b> Sélectionnez ou déposez <b>tous les fichiers du dossier</b>, y compris <code>manifest.json</code>.<br>
    <span class="sub">Select or drop <b>every file of the pack</b>, including <code>manifest.json</code>.</span></p>
    <p><input type="file" id="files" multiple></p>
  </div>

  <div id="out"></div>

  <p class="foot">
    Cette page vérifie (1) la signature RSA-SHA-256 du manifeste avec la clé publique incluse, (2) que chaque fichier
    correspond exactement à l'empreinte SHA-256 signée, et (3) le registre de transparence : l'entrée de cette enveloppe
    s'enchaîne par hachages successifs jusqu'à un point de contrôle signé — toute réécriture de l'historique casserait la chaîne.
    <span class="sub">This page checks (1) the RSA-SHA-256 manifest signature against the embedded public key, (2) that every
    file matches its signed SHA-256, and (3) the transparency registry: this envelope's entry hash-chains all the way to a
    signed checkpoint — any rewrite of history breaks the chain.</span>
  </p>
</div>

<script>
function canonicalJson(v){
  if(v===null) return "null";
  switch(typeof v){
    case "boolean": return v?"true":"false";
    case "number": return JSON.stringify(v);
    case "string": return JSON.stringify(v);
    case "object": {
      if(Array.isArray(v)) return "["+v.map(function(x){return canonicalJson(x);}).join(",")+"]";
      var keys=Object.keys(v).sort();
      return "{"+keys.map(function(k){return JSON.stringify(k)+":"+canonicalJson(v[k]);}).join(",")+"}";
    }
    default: return "null";
  }
}
function b64ToBytes(b64){
  var bin=atob(b64.replace(/\\s+/g,""));
  var u=new Uint8Array(bin.length);
  for(var i=0;i<bin.length;i++)u[i]=bin.charCodeAt(i);
  return u;
}
function pemToBytes(pem){
  return b64ToBytes(pem.replace(/-----BEGIN PUBLIC KEY-----/,"").replace(/-----END PUBLIC KEY-----/,""));
}
function hex(buf){
  var u=new Uint8Array(buf),s="";
  for(var i=0;i<u.length;i++)s+=(u[i]<16?"0":"")+u[i].toString(16);
  return s;
}
var enc=new TextEncoder();

function el(tag,cls,text){var e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;}
function esc(s){var d=document.createElement("div");d.textContent=String(s);return d.innerHTML;}

async function sha256Hex(buf){ return hex(await crypto.subtle.digest("SHA-256", buf)); }

async function verify(fileList){
  var out=document.getElementById("out");
  out.textContent="";
  var files=[];
  for(var i=0;i<fileList.length;i++)files.push(fileList[i]);
  var byName={};
  files.forEach(function(f){ byName[f.name]=f; });

  var mf=byName["manifest.json"];
  if(!mf){
    out.appendChild(el("div","banner bad","manifest.json est manquant / manifest.json is missing"));
    return;
  }
  var manifest;
  try{ manifest=JSON.parse(await mf.text()); }
  catch(e){ out.appendChild(el("div","banner bad","manifest.json illisible / unreadable")); return; }
  var p=manifest.payload;
  if(!p||manifest.format!=="docurama-evidence-pack"||!p.signing||!p.signing.publicKeyPem){
    out.appendChild(el("div","banner bad","Format non reconnu / unrecognized format"));
    return;
  }

  // 1 — signature over canonical(payload)
  var canonical=canonicalJson(p);
  var sigOk=false;
  try{
    var key=await crypto.subtle.importKey("spki",pemToBytes(p.signing.publicKeyPem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
    sigOk=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",key,b64ToBytes(manifest.signature),enc.encode(canonical));
  }catch(e){ sigOk=false; }

  var banner=el("div","banner "+(sigOk?"ok":"bad"),
    sigOk?"Signature du manifeste VALIDE — émise par la clé du dossier · Manifest signature VALID — signed by the pack key"
         :"Signature du manifeste INVALIDE — le contenu a été modifié ou la clé est incorrecte · Manifest signature INVALID");
  out.appendChild(banner);

  // 2 — every artifact must match its signed SHA-256
  var table=document.createElement("table");
  var thead=document.createElement("thead");
  thead.innerHTML="<tr><th>Fichier / File</th><th>État / Status</th><th>SHA-256 (calculé / computed)</th></tr>";
  table.appendChild(thead);
  var tbody=document.createElement("tbody");
  var allOk=true;
  for(var j=0;j<p.artifacts.length;j++){
    var a=p.artifacts[j];
    var base=a.path.split("/").pop();
    var f=byName[base];
    var tr=document.createElement("tr");
    var tdP=el("td","mono",a.path);
    var tdS,tdH;
    if(!f){
      tdS=el("td");tdS.appendChild(el("span","tag bad","ABSENT"));
      tdH=el("td","mono","—"); allOk=false;
    } else {
      var h=await sha256Hex(await f.arrayBuffer());
      var ok=h===a.sha256;
      if(!ok)allOk=false;
      tdS=el("td");tdS.appendChild(el("span","tag "+(ok?"ok":"bad"),ok?"OK":"ALTÉRÉ / ALTERED"));
      tdH=el("td","mono",h);
    }
    tr.appendChild(tdP);tr.appendChild(tdS);tr.appendChild(tdH);
    tbody.appendChild(tr);
  }
  table.appendChild(tbody);
  out.appendChild(table);
  if(!allOk){
    out.insertBefore(el("div","banner bad","Des fichiers ne correspondent pas à leurs empreintes signées · Some files do not match their signed digests"),table);
  }

  // 3 — envelope summary
  var m=el("div","meta");
  m.innerHTML=
    "<b>"+esc(p.envelope.code)+"</b> — "+esc(p.envelope.title)+"<br>"+
    "SHA-256 : <span class='mono' style='font-family:ui-monospace,monospace;font-size:11px;word-break:break-all'>"+esc(p.envelope.sha256)+"</span><br>"+
    "Clé / Key : "+esc(p.signing.keyId)+" · thumbprint "+esc(p.signing.keyThumbprint)+(p.signing.sanDomain?"<br>Domaine vérifié (SAN DNS) / verified domain: "+esc(p.signing.sanDomain):"")+
    "<br>Scellé le / sealed: "+esc(p.envelope.sealedAt)+(p.envelope.verifiedSenderDomain?"<br>Domaine expéditeur vérifié / sender domain verified: "+esc(p.envelope.verifiedSenderDomain):"");
  out.appendChild(m);

  // 4 — transparency registry: the entry must commit to this envelope's
  //     fingerprint, chain link-by-link to the head, and the checkpoint must
  //     cover exactly that head under the pack key. All re-hashed locally.
  var t=p.transparency;
  if(t&&t.format==="docurama-transparency-v1"&&t.entry&&t.segment&&t.checkpoint){
    var commitment={
      code:p.envelope.code,
      sha256:p.envelope.sha256,
      sealedAt:p.envelope.sealedAt,
      conformance:p.envelope.conformance,
      pages:p.envelope.pages,
      signerCount:p.signers.filter(function(s){return s.status==="SIGNED";}).length
    };
    var commitOk=(await sha256Hex(enc.encode(canonicalJson(commitment))))===t.entry.payloadHash;
    var entryOk=t.entry.head===await sha256Hex(enc.encode(canonicalJson({seq:t.entry.seq,payloadHash:t.entry.payloadHash,prevHead:t.entry.prevHead,at:t.entry.at})));

    var chainOk=true,chainReason="";
    if(!t.segment.length||t.segment[0].seq!==t.entry.seq||t.segment[0].payloadHash!==t.entry.payloadHash||t.segment[0].head!==t.entry.head){
      chainOk=false;chainReason="segment start";
    }else{
      var prev=null;
      for(var k=0;k<t.segment.length;k++){
        var cur=t.segment[k];
        // EVERY entry — including the first — re-hashes from its own fields,
        // so a rewritten prevHead cannot smuggle in a different history.
        var hh=await sha256Hex(enc.encode(canonicalJson({seq:cur.seq,payloadHash:cur.payloadHash,prevHead:cur.prevHead,at:cur.at})));
        if(hh!==cur.head){chainOk=false;chainReason="empreinte / hash seq "+cur.seq;break;}
        if(k>0&&(cur.seq!==prev.seq+1||cur.prevHead!==prev.head)){chainOk=false;chainReason="lien / link seq "+cur.seq;break;}
        prev=cur;
      }
      if(chainOk&&!t.truncated&&(prev.seq!==t.head.seq||prev.head!==t.head.head)){chainOk=false;chainReason="head";}
    }

    var cpOk=false;
    try{
      var cpKey=await crypto.subtle.importKey("spki",pemToBytes(p.signing.publicKeyPem),{name:"RSASSA-PKCS1-v1_5",hash:"SHA-256"},false,["verify"]);
      cpOk=await crypto.subtle.verify("RSASSA-PKCS1-v1_5",cpKey,b64ToBytes(t.checkpoint.signature),enc.encode(canonicalJson({format:t.checkpoint.format,keyId:t.checkpoint.keyId,size:t.checkpoint.size,head:t.checkpoint.head,at:t.checkpoint.at})));
    }catch(e){cpOk=false;}
    var cpCovers=t.checkpoint.size===t.head.seq&&t.checkpoint.head===t.head.head;

    var tOk=commitOk&&entryOk&&chainOk&&cpOk&&cpCovers;
    out.appendChild(el("div","banner "+(tOk?"ok":"bad"),
      tOk?"Registre de transparence VALIDE — l'entrée #"+t.entry.seq+" s'enchaîne jusqu'au point de contrôle signé · Transparency registry VALID — entry #"+t.entry.seq+" chains to the signed checkpoint"
         :"Registre de transparence INVALIDE — "+(chainOk?"point de contrôle / checkpoint":("chaîne / chain ("+chainReason+")"))+" incohérent · Transparency registry INVALID"));

    var tm=el("div","meta");
    tm.innerHTML="<b>Registre de transparence / Transparency registry</b><br>"+
      "Entrée / entry #"+esc(t.entry.seq)+" · chaîne vérifiée jusqu'à / chain verified to #"+esc(t.head.seq)+(t.truncated?" (segment tronqué / truncated segment)":"")+"<br>"+
      "Engagement / commitment : <span style='font-family:ui-monospace,monospace;font-size:11px;word-break:break-all'>"+esc(t.entry.payloadHash)+"</span><br>"+
      "Point de contrôle / checkpoint (taille / size "+esc(t.checkpoint.size)+") : <span style='font-family:ui-monospace,monospace;font-size:11px;word-break:break-all'>"+esc(t.checkpoint.head)+"</span>";
    out.appendChild(tm);
  }
}

document.getElementById("files").addEventListener("change",function(e){ verify(e.target.files); });
var drop=document.getElementById("drop");
["dragenter","dragover"].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.add("over");});});
["dragleave","drop"].forEach(function(ev){drop.addEventListener(ev,function(e){e.preventDefault();e.stopPropagation();drop.classList.remove("over");});});
drop.addEventListener("drop",function(e){ if(e.dataTransfer&&e.dataTransfer.files.length) verify(e.dataTransfer.files); });
</script>
</body>
</html>`;
}

/* ── README ────────────────────────────────────────────────────────────────── */

function renderReadme(code: string): string {
  return `DOSSIER DE PREUVE DOCURAMA / DOCURAMA EVIDENCE PACK
Code de vérification / verification code : ${code}

CONTENU / CONTENTS
  manifest.json                    Manifeste signé (JSON canonique + signature RSA-SHA-256)
                                   Signed manifest (canonical JSON + RSA-SHA-256 signature)
  verify.html                      Vérificateur hors ligne — ouvrez-le dans un navigateur
                                   Offline verifier — open it in any browser
  CERTIFICATE-OF-COMPLETION.html   Certificat de signature bilingue, prêt à imprimer en PDF
                                   Bilingual signature certificate, print-to-PDF ready
  document/                        Le document scellé, octet pour octet / the sealed artefact, byte-exact
  evidence/event-ledger.csv        Piste d'audit horodatée complète / full timestamped audit ledger
  evidence/envelope.json           Enregistrement d'enveloppe lisible par machine / machine-readable record
  certificate/evidence-key.pem     Certificat X.509 de la clé de signature (SAN DNS si domaine vérifié)
                                   X.509 certificate of the signing key (DNS SAN when domain-verified)
  certificate/evidence-key.pub.pem Clé publique SPKI / SPKI public key

VÉRIFIER / VERIFY
  1. Ouvrez verify.html dans un navigateur moderne (fichier local, aucune connexion requise).
  2. Sélectionnez TOUS les fichiers de ce dossier, y compris manifest.json.
  3. La page vérifie la signature du manifeste puis l'empreinte SHA-256 de chaque fichier.

  1. Open verify.html in a modern browser (local file, no connection required).
  2. Select EVERY file of this pack, including manifest.json.
  3. The page checks the manifest signature, then every file's SHA-256 digest.

  En ligne / online : le code ${code} peut aussi être vérifié sur le portail public
  verify.docurama.eu (ou l'attestation publiée par l'instance émettrice).

CONFIANCE / TRUST
  Le manifeste est signé par la clé de preuve de l'espace de travail émetteur.
  L'empreinte du certificat (thumbprint) est inscrite dans le manifeste ; le domaine
  SAN a été vérifié par enregistrement DNS TXT avant l'émission du certificat.
  Le manifeste contient aussi un registre de transparence : l'entrée de cette
  enveloppe dans une chaîne append-only (hachages chaînés) et un point de contrôle
  signé — verify.html re-hache toute la chaîne hors ligne ; toute réécriture de
  l'historique la casserait.
  Docurama n'est pas un QTSP eIDAS — le niveau de conformance indiqué reflète
  exactement les mécanismes appliqués.

  The manifest is signed by the issuing workspace's evidence key. The certificate
  thumbprint is recorded in the manifest; the SAN domain was verified via a DNS TXT
  record before the certificate was issued. The manifest also carries a transparency
  registry: this envelope's entry in an append-only hash chain plus a signed
  checkpoint — verify.html re-hashes the whole chain offline; any rewrite of
  history would break it. Docurama is not an eIDAS QTSP — the stated conformance
  level reflects exactly the mechanisms applied.

Docurama SAS · 1 Rue Marguerin, 75014 Paris, France · docurama.eu
`;
}

/* ── Builder ───────────────────────────────────────────────────────────────── */

export type BuiltEvidencePack = {
  bytes: Buffer;
  filename: string;
  code: string;
};

export async function buildEvidencePack(envelopeKey: string, tenantId: string): Promise<BuiltEvidencePack> {
  const e = await loadEnvelope(envelopeKey, tenantId);
  if (!e) throw new EvidencePackError("Envelope not found in this workspace", 404);
  if (e.status !== "COMPLETED" || !e.sealedAt || !e.sha256) {
    throw new EvidencePackError("An evidence pack can only be exported for a completed, sealed envelope", 400);
  }

  const key = await getOrCreateEvidenceKey(e.tenantId);

  /* Transparency registry: the seal commitment is appended to the tenant's
     append-only hash chain (idempotent — envelopes sealed before the registry
     existed are committed now, at export time, which is exactly how CT logs
     treat previously-issued certificates). The pack then carries the entry,
     the chain segment to the current head, and a signed checkpoint, so any
     third party can prove inclusion offline in verify.html. */
  const signerCount = e.recipients.filter((r) => r.role === "SIGNER" && r.status === "SIGNED").length;
  const entry = await appendSealCommitment({
    tenantId: e.tenantId,
    envelopeId: e.id,
    commitment: {
      code: e.publicCode,
      sha256: e.sha256,
      sealedAt: e.sealedAt.toISOString(),
      conformance: e.conformanceLevel,
      pages: e.pages,
      signerCount,
    },
  });
  const { segment, truncated } = await getChainSegment(e.tenantId, entry.seq);
  const head = segment.length > 0 ? { seq: segment[segment.length - 1].seq, head: segment[segment.length - 1].head } : { seq: entry.seq, head: entry.head };
  const transparencyBlock: PackTransparencyBlock = {
    format: TRANSPARENCY_FORMAT,
    entry: {
      seq: entry.seq, payloadHash: entry.payloadHash, prevHead: entry.prevHead,
      head: entry.head, at: entry.at.toISOString(),
    },
    head,
    segment,
    truncated,
    checkpoint: signCheckpoint(key, head),
  };

  /* Document artifact — byte-exact. Template-based envelopes carry the contract
     text; a missing file is recorded honestly rather than papered over. */
  const artifacts: { path: string; data: Buffer }[] = [];
  if (e.documentId && e.document) {
    try {
      const data = await readStoredBytes(e.document.storageKey);
      const safeName = (e.document.filename || "document.pdf").replace(/[\\/:*?"<>|]/g, "_").slice(0, 120);
      artifacts.push({ path: `document/${safeName}`, data });
    } catch {
      artifacts.push({
        path: "document/FILE-MISSING.txt",
        data: Buffer.from(
          `The stored file for this envelope could not be read from storage at export time.\n` +
            `The SHA-256 below remains the digest recorded at sealing.\n`,
          "utf8",
        ),
      });
    }
  } else if (e.template?.bodyMarkdown) {
    artifacts.push({
      path: "document/contract-text.md",
      data: Buffer.from(e.template.bodyMarkdown, "utf8"),
    });
  }

  /* Ledger CSV + envelope record */
  const csvLines = ["at,actor,action,detail,ip_hash"];
  for (const ev of e.events) {
    csvLines.push(
      [ev.at.toISOString(), ev.actor, ev.action, ev.detail ?? "", ev.ipHash ?? ""].map(csvCell).join(","),
    );
  }
  artifacts.push({ path: "evidence/event-ledger.csv", data: Buffer.from(csvLines.join("\r\n") + "\r\n", "utf8") });

  const envelopeRecord = {
    code: e.publicCode,
    title: e.title,
    status: e.status,
    pages: e.pages,
    sha256: e.sha256,
    conformance: e.conformanceLevel,
    createdAt: iso(e.createdAt),
    sealedAt: iso(e.sealedAt),
    completedAt: iso(e.completedAt),
    verifiedSenderDomain: e.verifiedSenderDomain,
    tenant: e.tenant.name,
    sender: { name: `${e.createdBy.firstName} ${e.createdBy.lastName}`, email: e.createdBy.email },
    recipients: e.recipients.map((r) => ({
      name: r.name, email: r.email, role: r.role, order: r.order,
      status: r.status, signedAt: iso(r.signedAt),
    })),
    eventCount: e.events.length,
  };
  artifacts.push({ path: "evidence/envelope.json", data: Buffer.from(JSON.stringify(envelopeRecord, null, 2), "utf8") });

  /* Certificates */
  artifacts.push({ path: "certificate/evidence-key.pem", data: Buffer.from(key.certificatePem + "\n", "utf8") });
  artifacts.push({ path: "certificate/evidence-key.pub.pem", data: Buffer.from(key.publicKeyPem + "\n", "utf8") });

  /* Human surfaces */
  artifacts.push({ path: "CERTIFICATE-OF-COMPLETION.html", data: Buffer.from(renderCertificateHtml(e), "utf8") });
  artifacts.push({ path: "verify.html", data: Buffer.from(renderVerifyHtml(), "utf8") });
  artifacts.push({ path: "README.txt", data: Buffer.from(renderReadme(e.publicCode), "utf8") });

  /* Signed manifest */
  const payload = {
    format: EVIDENCE_PACK_FORMAT,
    version: EVIDENCE_PACK_VERSION,
    generatedAt: new Date().toISOString(),
    envelope: {
      code: e.publicCode,
      title: e.title,
      status: e.status,
      pages: e.pages,
      sha256: e.sha256,
      conformance: e.conformanceLevel,
      createdAt: iso(e.createdAt),
      sealedAt: iso(e.sealedAt),
      completedAt: iso(e.completedAt),
      verifiedSenderDomain: e.verifiedSenderDomain,
      tenantName: e.tenant.name,
    },
    signers: e.recipients
      .filter((r) => r.role === "SIGNER")
      .map((r) => ({ name: r.name, email: r.email, order: r.order, status: r.status, signedAt: iso(r.signedAt) })),
    artifacts: artifacts.map((a) => ({
      path: a.path,
      sha256: createHash("sha256").update(a.data).digest("hex"),
      bytes: a.data.length,
    })),
    signing: {
      algorithm: EVIDENCE_SIGNATURE_ALGORITHM,
      keyId: key.keyId,
      keyThumbprint: key.thumbprint,
      publicKeyPem: key.publicKeyPem,
      certificatePem: key.certificatePem,
      sanDomain: key.sanDomain,
      keyCreatedAt: iso(key.createdAt),
    },
    transparency: transparencyBlock,
  };
  const manifest = {
    format: EVIDENCE_PACK_FORMAT,
    version: EVIDENCE_PACK_VERSION,
    payload,
    signature: signPayload(key.privateKeyPem, payload),
  };
  artifacts.push({ path: "manifest.json", data: Buffer.from(JSON.stringify(manifest, null, 2), "utf8") });

  const bytes = zipStore(artifacts as ZipEntry[]);
  return { bytes, filename: `evidence-${e.publicCode}.zip`, code: e.publicCode };
}

/** Record an export in the envelope ledger (after the pack is built, so the
 *  pack's own CSV never contains its own export event — exports are append-only). */
export async function recordEvidencePackExport(envelopeKey: string, tenantId: string, actor: string): Promise<void> {
  const e = await db.envelope.findFirst({
    where: { tenantId, OR: [{ id: envelopeKey }, { publicCode: envelopeKey.toUpperCase() }] },
    select: { id: true, publicCode: true },
  });
  if (!e) return;
  await db.envelopeEvent.create({
    data: {
      envelopeId: e.id,
      actor,
      action: "EVIDENCE_EXPORTED",
      detail: `Evidence pack exported (signed manifest, ledger, certificate) — code ${e.publicCode}`,
    },
  });
}
