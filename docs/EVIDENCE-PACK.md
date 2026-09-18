# Evidence Pack — Format Specification (v1)

An evidence pack is the portable, self-verifying proof of one completed
envelope: everything a counterparty, auditor or court needs to check the
signatures **without any Docurama infrastructure**, packed into a single ZIP
and signed.

- Export: envelope detail sheet → **Evidence pack (.zip)** (workspace session),
  or `GET /api/v1/envelopes/{idOrCode}/evidence-pack` with an `X-API-Key`.
- Only `COMPLETED` + sealed envelopes can be exported; anything else is an
  honest 400.
- Every export is recorded in the envelope's event ledger (`EVIDENCE_EXPORTED`)
  — the audit trail states who pulled evidence and when.

## Contents

| Path | What it is |
|---|---|
| `manifest.json` | Signed manifest: envelope facts, signer roster, every artifact's SHA-256, and the RSA-SHA-256 signature over the canonical JSON payload |
| `verify.html` | Offline verifier — open in any modern browser, select all files, get a verdict. Zero network calls |
| `CERTIFICATE-OF-COMPLETION.html` | Bilingual (FR/EN) human proof certificate; open → print to PDF |
| `document/<file>` | The sealed artefact, byte-exact (PDF when uploaded; `contract-text.md` for template envelopes). If storage no longer holds the file, an honest `FILE-MISSING.txt` is packed instead |
| `evidence/event-ledger.csv` | The complete timestamped event ledger (RFC 4180) |
| `evidence/envelope.json` | Machine-readable envelope record: recipients, statuses, digests |
| `certificate/evidence-key.pem` | The X.509 certificate of the workspace evidence key. When the workspace has a DNS-TXT-verified sending domain, it is embedded as a `subjectAltName DNS:` entry |
| `certificate/evidence-key.pub.pem` | The SPKI public key — the only thing needed to verify the manifest signature |
| `README.txt` | Bilingual instructions |

The ZIP uses the STORE method (no compression): every artifact is byte-exact,
the writer is ~100 auditable lines, and re-hashing a file from the archive
yields exactly the signed digest.

## Manifest structure

```json
{
  "format": "docurama-evidence-pack",
  "version": 1,
  "payload": {
    "format": "docurama-evidence-pack",
    "version": 1,
    "generatedAt": "2026-09-17T09:00:00.000Z",
    "envelope": {
      "code": "DOC-XXXXXXXX", "title": "…", "status": "COMPLETED",
      "pages": 5, "sha256": "…", "conformance": "B-T",
      "createdAt": "…", "sealedAt": "…", "completedAt": "…",
      "verifiedSenderDomain": "mail.company.com",
      "tenantName": "Company SAS"
    },
    "signers": [ { "name": "…", "email": "…", "order": 1, "status": "SIGNED", "signedAt": "…" } ],
    "artifacts": [ { "path": "document/contract.pdf", "sha256": "…", "bytes": 12345 } ],
    "signing": {
      "algorithm": "RSASSA-PKCS1-v1_5-SHA-256",
      "keyId": "ek_…", "keyThumbprint": "…",
      "publicKeyPem": "-----BEGIN PUBLIC KEY-----…",
      "certificatePem": "-----BEGIN CERTIFICATE-----…",
      "sanDomain": "mail.company.com", "keyCreatedAt": "…"
    },
    "transparency": {
      "format": "docurama-transparency-v1",
      "entry": { "seq": 12, "payloadHash": "…", "prevHead": "…", "head": "…", "at": "…" },
      "head": { "seq": 17, "head": "…" },
      "segment": [ { "seq": 12, "payloadHash": "…", "prevHead": "…", "head": "…", "at": "…" }, … ],
      "truncated": false,
      "checkpoint": {
        "format": "docurama-transparency-checkpoint",
        "keyId": "ek_…", "size": 17, "head": "…", "at": "…",
        "signature": "base64(RSA-SHA-256 over canonical {format, keyId, size, head, at})"
      }
    }
  },
  "signature": "base64(RSA-SHA-256 over canonicalJson(payload))"
}
```

**Canonical JSON** (`src/lib/canonical-json.ts`, mirrored inside
`verify.html`): object keys sorted recursively, no whitespace, standard JSON
escapes. Any verifier that reproduces those rules reproduces the signed bytes.

### The transparency block

Every pack carries an **inclusion proof** in the workspace's append-only hash
chain (see `docs/TRANSPARENCY-LOG.md`): the envelope's chain entry, the
segment of entries from it to the current head, and a checkpoint signed by the
same evidence key. `verify.html` re-hashes the entire chain offline:

- `entry.payloadHash` = SHA-256 of the canonical seal commitment
  `{code, sha256, sealedAt, conformance, pages, signerCount}` — recomputed
  from the manifest's own fields, so the entry provably commits to THIS pack;
- every segment entry — including the first — re-hashes from
  `{seq, payloadHash, prevHead, at}`, and each `prevHead` links to the
  previous head: rewriting any entry breaks the chain at that point;
- the checkpoint covers exactly the segment's last head, under the pack key.

Envelopes sealed before the registry existed are committed lazily at first
export — the same way CT logs treat previously-issued certificates; the
commitment itself still carries the true `sealedAt`.

## Verifying offline

1. Unzip the pack.
2. Open `verify.html` in a modern browser (works from `file://`, emits no
   network requests).
3. Select **all** files of the pack, including `manifest.json`.
4. The page:
   - imports the SPKI public key and verifies the manifest signature
     (WebCrypto, RSASSA-PKCS1-v1_5 + SHA-256);
   - re-hashes every artifact listed in the manifest and compares against the
     signed digests;
   - re-hashes the transparency chain from the entry to the signed checkpoint
     (see above) and shows the registry position;
   - shows the envelope facts, the key id/thumbprint and the SAN domain.

Anything altered after export shows as `ALTÉRÉ / ALTERED` and/or an invalid
manifest signature. A deep-check harness for this exact flow lives at
`scripts/verify-offline-check.ts` (drives real Chromium against a freshly
exported pack).

## Trust model, stated honestly

- The evidence key is a **self-signed** RSA-2048 certificate held by the
  workspace's instance. What vouches for it:
  1. **DNS** — a SAN domain in the certificate was proven controlled by the
     tenant via the `_docurama.<domain> TXT` record **before issuance**;
  2. **TOFU pinning** — on the public verification portal, the first key an
     instance registers is pinned and every later attestation must match it.
- The manifest signature proves *integrity and origin* (which key produced the
  pack) — binding that key to a legal identity is what the DNS SAN and the
  portal registry provide.
- Docurama is **not** an eIDAS QTSP; the certificate and the conformance level
  state exactly what was applied, nothing more.

## Relation to the public portal

The same evidence key signs the **portal attestation** pushed at seal time
(see `docs/SELF-HOSTED-ATTESTATION.md`): the portal result, the evidence pack
and the offline verifier all anchor on the same key and the same SHA-256
digest. A third party can cross-check the pack against
`verify.docurama.eu/{code}` — or, if the instance is unreachable, rely on the
pack alone.
