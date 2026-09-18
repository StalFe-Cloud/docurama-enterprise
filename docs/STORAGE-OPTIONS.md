# Storage options for Docurama — object storage backends, compared

Docurama stores uploaded documents on two interchangeable backends behind one
policy module (`src/lib/document-store.ts`):

- **Local filesystem** (default) — zero-config, under `STORAGE_DIR`. The right
  answer for single-node deployments and small sites: one machine, one volume,
  `scripts/backup.sh` snapshots the tree.
- **S3-compatible object storage** — set the `S3_*` env block. The right answer
  for multitenant / multi-replica / large-volume deployments: the app tier
  becomes stateless (survives node loss, scales horizontally), and durability
  becomes the storage layer's problem instead of a backup script's.

The `storageKey` on every `Document` row is the same relative key on both
backends (`documents/{tenantId}/{docId}.pdf`), which has two useful
consequences: per-tenant objects share a prefix (cheap per-tenant export,
DSAR, or future per-tenant encryption keys), and migrating a filesystem tree
to a bucket is a plain recursive copy — no import tool, no DB rewrite
(migration recipe at the end of this document).

The S3 backend is exercised in CI against a **real SeaweedFS instance**
(`e2e/s3-seaweed.test.ts` spawns `weed server -s3` on scratch ports and drives
uploads, reads, deletes, the retention sweep and the health probe through it)
— the integration is continuously tested, not aspirational.

---

## 1. What Docurama needs from a storage engine

| Requirement | Why it matters here |
|---|---|
| S3 API compatibility (Put/Get/Delete/List, path-style) | The app is a plain S3 client (`@aws-sdk/client-s3`, `forcePathStyle`). No proprietary features are used, so any compatible engine works. |
| License that survives an enterprise questionnaire | Docurama is sold to enterprises; procurement asks "any AGPL in the stack?". Apache-2.0/MIT-class engines answer "no" cleanly. |
| Bounded operational weight | A 3-person team runs the whole product. Storage must not need its own on-call rotation. |
| Durability story | Sealed documents are legal evidence; the backend must replicate or erasure-code, and support off-site/cloud tiering. |
| Works air-gapped | Several deployment shapes (self-hosted enterprise, private cloud) have no egress; a cloud-only engine is disqualified for them. |

## 2. The landscape (all prices checked 2026-09; free tiers are where €0 runs live)

### Self-hostable engines

| Engine | License | Ops weight | Durability | Verdict for Docurama |
|---|---|---|---|---|
| **SeaweedFS** ([github](https://github.com/seaweedfs/seaweedfs)) | **Apache-2.0** | **Tiny** — one Go binary runs master+volume+filer+S3 gateway; 3 nodes is a full cluster | Replication (configurable, e.g. 002 = 2 copies on different racks) + erasure coding for large volumes + cloud tiering to S3/GCS/Azure | **The default recommendation** for self-hosted / private cloud. Apache-2.0, no copyleft questionnaire, and it's the engine our CI tests against. |
| MinIO | **AGPLv3** | Small — single binary, but the community edition is feature-frozen (console/management features move to the paid AIStor tier) | Erasure coding (server pools) | Technically excellent, but AGPLv3 trips enterprise procurement policies even when Docurama (a *client* over the S3 protocol, not a derivative work) is unaffected — the customer's legal review, not the licence text, is the cost. Use when the org already runs it. |
| Garage | **AGPLv3** | Small — Rust binary, designed for 3-node geo-distributed setups on tiny hardware | 3x replication, geo-distributed | Same AGPL caveat. Genuinely good for 3 cheap nodes across 3 sites; niche vs SeaweedFS unless geo-spread is the point. |
| Ceph RGW | LGPL-2.1 | **Heavy** — monitors, managers, OSDs; a skill set of its own | Best-in-class, petabyte-scale | If the organisation already operates a Ceph cluster, point `S3_ENDPOINT` at its RGW and stop reading. Never stand one up *just* for Docurama. |
| Zenko CloudServer | Apache-2.0 | Small — Node.js S3 server | None beyond the disk | Fine for dev/test; not a durability play. |
| `rclone serve s3` | MIT | Trivial — wraps any rclone backend as S3 | Whatever the backend has | Handy for experiments (e.g. serve a mounted directory as S3 to rehearse a migration); not production storage. |

### Managed / cloud (relevant to the public-cloud shapes)

| Service | Free tier | Egress cost | Notes |
|---|---|---|---|
| **Cloudflare R2** | **10 GB storage, 1M class-A / 10M class-B ops per month** | **Zero — egress is free, permanently** | S3-compatible (endpoint + access keys, path-style). The €0 public-cloud start: evidence-pack downloads and signer preview traffic cost nothing to serve. Growth beyond free tier is usage-priced. |
| Backblaze B2 | 10 GB storage | Free up to 3× average monthly storage; beyond that cheap | S3-compatible. Generous and simple. |
| AWS S3 / GCS / Azure Blob | none (paid) | per-GB (high) | The defaults when the operator is already in that cloud — zero novelty, zero €0. |
| Scaleway Object Storage / OVH / Hetzner | none (paid, cheap, EU regions) | varies | The EU-sovereignty options called out in PRODUCTION-PLAN §9 (Scaleway Paris / OVH Gravelines); pick per data-residency requirements. |

## 3. Recommendation by deployment shape

| Shape | Backend | Why |
|---|---|---|
| **Self-hosted, single node** | Local filesystem (default) | Zero new moving parts; `backup.sh` covers it. Add SeaweedFS single-binary only if the node's disk is the reliability worry. |
| **Self-hosted enterprise / air-gapped** | **SeaweedFS** (single binary or 3-node) | Apache-2.0, one process, replication/EC, no egress required. Buckets are namespace-isolated; auth via `s3.json` (below). |
| **Private cloud (multi-tenant, on-prem hardware)** | **SeaweedFS cluster** (3 volume nodes, replication 002 or EC) or existing Ceph RGW | Storage independent of app nodes; app tier becomes stateless and multi-replica (`DOCURAMA_WORKER=off` on all but one). |
| **Public cloud SaaS** | **Cloudflare R2** free tier → usage-priced at growth (or native S3 where the org already is) | €0 to start, and free egress matters twice here: signer previews and evidence-pack downloads are read-heavy. |
| **Dev / CI** | Local filesystem; `e2e/s3-seaweed.test.ts` runs real SeaweedFS in CI | Hermetic by default, real integration where it counts. |

Why not MinIO/Garage as the default despite their quality: both are AGPLv3.
Docurama itself remains unencumbered either way (it is a protocol client, not
a linked or modified derivative), but enterprise procurement questionnaires
rarely distinguish "AGPL component in the stack" from "AGPL obligations on
your product" — and an e-sign vendor answering legal review wants the short
answer. SeaweedFS gives the same S3 API with none of that conversation.

## 4. Running it

### 4a. Docker Compose (single host)

```bash
docker compose --profile s3 up -d          # app + SeaweedFS
```

The `seaweed` service (image `chrislusf/seaweedfs:4.47`, pinned to the
version CI verifies) exposes the S3 gateway on `127.0.0.1:8333`. Enable the
backend by uncommenting the `S3_*` lines in the `docurama` service's
environment (endpoint `http://seaweed:8333`; the bucket auto-creates on first
upload). Combine with `--profile mail` to also get Mailpit as an SMTP sink.

### 4b. Single binary (no Docker)

```bash
curl -sL https://github.com/seaweedfs/seaweedfs/releases/download/4.47/linux_amd64.tar.gz | tar xz
mkdir -p /var/lib/seaweed
./weed server -dir=/var/lib/seaweed -ip=<advertised-ip> -ip.bind=0.0.0.0 \
  -master.volumeSizeLimitMB=2048 -s3 -s3.port=8333
```

> **`-ip` is load-bearing** (verified the hard way in CI): with only
> `-ip.bind` set, the filer advertises the machine's LAN address for
> volume-server uploads and every Put fails with a generic 500. `-ip` must be
> the address other components can reach (the service name under Compose,
> `127.0.0.1` for a co-located single node).

Then point Docurama at it:

```bash
S3_ENDPOINT=http://127.0.0.1:8333
S3_BUCKET=docurama
S3_ACCESS_KEY_ID=docurama
S3_SECRET_ACCESS_KEY=<secret>
S3_REGION=us-east-1          # any value works; SeaweedFS ignores it
```

`/api/health` reports the active backend (`checks.storage.backend`) and
proves the write path with a round-trip probe — trust it before trusting the
config.

### 4c. Authentication hardening (production SeaweedFS)

Out of the box the S3 gateway accepts any credentials (anonymous) — fine on
a loopback or an isolated Compose network, not fine on a shared network.
Mount an `s3.json` and pass `-s3.config`:

```json
{
  "identities": [
    {
      "name": "docurama",
      "credentials": [{ "accessKey": "docurama", "secretKey": "<long-secret>" }],
      "actions": ["Read:docurama", "List:docurama", "Write:docurama", "Delete:docurama"]
    },
    { "name": "anonymous", "actions": [] }
  ]
}
```

```bash
weed server -dir=/var/lib/seaweed -ip=seaweed.example -s3 -s3.port=8333 \
  -s3.config=/etc/seaweedfs/s3.json
```

Put the bucket in front of TLS (the usual reverse proxy), and remember the
admin UIs (master `:9333`, filer `:8888`) must not be exposed beyond the
storage network.

### 4d. Kubernetes (Helm)

```yaml
s3:
  enabled: true
  endpoint: "http://seaweedfs-s3.storage.svc:8333"
  bucket: docurama
  region: eu-west-1
  autoCreateBucket: false          # the bucket is managed by the storage team
  existingSecret: docurama-s3      # kubectl create secret generic docurama-s3 …
```

`helm lint` and template rendering are validated in the repo (CI installs the
helm binary for the chart checks); credentials always come from a Secret,
never from values.yaml.

## 5. Migrating a filesystem tree to object storage

The layout is identical, so this is a copy, not a conversion:

```bash
# rclone (configure the S3 remote to point at your endpoint/bucket/creds)
rclone copy --checksum ./storage/documents  remote:docurama/documents

# or with the AWS CLI against any compatible endpoint
aws --endpoint-url http://seaweed:8333 s3 sync ./storage/documents s3://docurama/documents
```

Roll-out order that keeps the lights on: copy first, then set the `S3_*` env
and restart (existing rows keep resolving — the key is the same string), then
watch `/api/health` flip to `backend: "s3"`. Remove the old tree only after a
spot-check of sealed envelopes' evidence packs. Downgrade is the same env
unset — nothing in the database is backend-specific.

## 6. Operational notes

- **Worker topology**: with S3 + Postgres the app tier is stateless; keep
  `replicaCount` at 1 only while SQLite is in play, and set
  `DOCURAMA_WORKER=off` on all but one replica in multi-replica tiers.
- **Upload path**: S3 mode buffers an upload (max 50 MiB) and validates the
  PDF magic bytes before the single PutObject — a rejected upload never
  creates an object; no partial or non-PDF bytes ever reach the bucket.
- **Retention sweep**: the admin compliance sweep (`purgeExpired`) works on
  both backends; in S3 mode it lists the `documents/` prefix and batch-deletes
  orphans. Envelope-backed evidence is never touched, on either backend.
- **Backups**: `scripts/backup.sh` covers the SQLite file; in S3 mode the
  bucket's durability/replication is the document backup (enable SeaweedFS
  volume snapshots or replicate to a second cluster/cloud tier if the RPO
  demands it).
