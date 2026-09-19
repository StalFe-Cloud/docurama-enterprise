---
title: Operating a Self-Hosted Instance
description: Day-two operations covering backups, upgrades, the background worker, mail outbox inspection, manual billing approvals and attestation push.
group: Self-hosting
order: 2
tags: [self-hosting, operations, backup]
---

Deployment is day one; this page is day two and every day after: backups you can restore, upgrades that apply themselves, a worker you keep singular, a mail ledger you can read, billing you approve by hand, and attestations pushed to your evidence portal.

## Backups

The repository ships `scripts/backup.sh`, which produces:

- a **consistent SQLite snapshot** via `sqlite3 .backup` — safe to run while the app is up,
- a **tar of the storage root** (or you sync the S3 bucket separately),
- **retention pruning** of old backup files,
- optional **GPG encryption** and **rsync** targets for shipping copies off-host.

Run it from cron — nightly is a sane default — and **test a restore once** before you need it. A restore is: database file back in place, storage tree back in place, container restarted, `/api/health` green. For PostgreSQL, pair the script with `pg_dump`; for the S3 backend, sync the bucket with `aws s3 sync` or `rclone`.

## Upgrades

1. **Take a backup.** This is the step that makes rollback possible.
2. Pull the new image (or commit) and restart — the container entrypoint applies schema changes on boot.
3. Watch `/api/health` until it is green.

Because schema changes apply automatically, the pre-upgrade backup is your rollback path: restore the previous data and run the previous image.

## The background worker

Every 30 seconds the worker runs three passes:

- **mail drain** — send QUEUED messages, retry FAILED ones on the backoff schedule,
- **webhook retries** — redeliver failed webhook deliveries,
- **subscription renewals** — the rollover-capped allowance math, idempotent, so a worker that was down catches up on missed renewals without double-applying them.

`DOCURAMA_WORKER=off` disables the worker — use it on extra app replicas and during maintenance. The worker must be a **singleton**: run exactly one, never a replica set.

## Mail outbox inspection

Every outbound message is a ledger row with a status — QUEUED, SENT or FAILED — plus attempts, last error and next attempt. From the admin console you can open any message and see exactly what the SMTP server said: bad credentials fail fast with a clear error, greylisting retries with backoff (roughly 30 seconds growing to a 30-minute cap, five attempts).

If mail is not moving, check in order:

1. Is `SMTP_URL` set? Without a transport, messages legitimately stay QUEUED — that is outbox-only mode, not a bug.
2. Read the outbox errors — they name the failing hop.
3. Verify the recipient domain accepts your mail (SPF/DKIM/DMARC posture).

## Manual billing approvals

Self-hosted deployments typically run billing in **manual mode**. The flow from the user's side: they request a plan and term, receive a **payment reference**, and wire the transfer out of band; a banner in their **Settings → Billing** shows the reference while the payment is pending. On your side: when the transfer lands, an **admin approves it in the admin console**, and the subscription activates exactly as if it had been paid by card. Approvals are audited.

## Attestation push to an evidence portal

Set `EVIDENCE_PORTAL_URL` and your instance pushes a **signed, GDPR-minimal attestation** for each completed envelope to your evidence portal. This is how a private instance still gets public proof: a verification request answered from the portal returns **VERIFIED_ATTESTED** without ever exposing the underlying document.

## Monitoring checklist

- `/api/health` green — probe it from outside the host, not just from within.
- Outbox FAILED count at zero; a climbing retry queue means SMTP trouble.
- Disk space on the storage root (or bucket budget).
- Backup job freshness — the newest backup should be younger than your tolerance for data loss.
