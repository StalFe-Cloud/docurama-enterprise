# Docurama Enterprise — installation and update guide

This repository packages the Docurama application for a customer-controlled installation. The application enforces invitation-only registration and prevents additional tenant creation in `DOCURAMA_DEPLOYMENT_MODE=selfhost` or `private_cloud`. These controls do not relocate an existing multi-tenant database or establish an air gap. Inventory existing tenants and external integrations before adoption.

The Enterprise Compose file, deployment assets and committed database are retained during application synchronization. See [upstream provenance](docs/UPSTREAM-SYNC.md). The committed database and account examples in historical documentation are development fixtures; do not use their credentials or data for a new production installation.

## Installation policy and configuration

| Setting | Behavior |
|---|---|
| `DOCURAMA_DEPLOYMENT_MODE=selfhost` | Public signup is closed even if its flag is true; only an authenticated platform admin may create the first tenant |
| `DOCURAMA_PUBLIC_REGISTRATION=false` | Explicitly closes uninvited signup; valid mailbox-bound invitations remain usable |
| `DATABASE_URL=file:/app/db/custom.db` | SQLite runtime path inside the mounted data directory; use one application replica |
| `STORAGE_DIR=/app/storage` | Persistent document storage, mounted separately from the image |
| `NEXT_PUBLIC_DEMO_MODE=false` | Required for production; never run demo seeding on a real installation |
| `SSO_TXN_SECRET` | Random secret of at least 32 characters when SSO is enabled; schema must include `SsoTransaction` |
| `REKOR_WITNESS=off` | Disables external Rekor witnessing when outbound access is not authorized |

Configure SMTP and public origin using [.env.example](.env.example) and the [operations runbook](docs/OPERATIONS-RUNBOOK.md). The base Compose file does not pass every `.env` value into its container: explicitly map required variables or use a protected, untracked environment file. Optional Stripe, IdP, Turnstile, object storage and TSA integrations require separate network and credential decisions. For Turnstile, the public site key is a build argument and its server secret is runtime configuration; leave it disabled when Cloudflare access is not approved.

The checked-in port mapping is `0.0.0.0:3003:3000`; `PORT_HOST` is not implemented by that file. Establish firewall and TLS reverse-proxy configuration before exposing the service. SAML requires HTTPS. Selecting this edition does not establish certificate/HSM integration, PAdES conformance or air-gap certification.

## New installation

Use empty runtime storage instead of the committed fixture database. On a Linux host, create only the intended directories and assign them to the image's UID/GID 10001:

```sh
cd /opt/docurama-enterprise
sudo install -d -o 10001 -g 10001 -m 0700 /var/lib/docurama-enterprise/db /var/lib/docurama-enterprise/storage
```

For example, create an operator-owned `compose.production.yml` outside version control:

```yaml
services:
  docurama:
    env_file:
      - /etc/docurama-enterprise/runtime.env
    volumes:
      - /var/lib/docurama-enterprise/db:/app/db
      - /var/lib/docurama-enterprise/storage:/app/storage
```

Compose merges volume entries by container target, so these replace the fixture mounts. See [Docker's merge rules](https://docs.docker.com/reference/compose-file/merge/). Inspect resolved mount targets privately; configuration output can contain secrets.

Build the reviewed version and initialize the empty schema with a one-off container. This command neither accepts destructive schema changes nor seeds users:

```sh
docker compose -f docker-compose.yml -f compose.production.yml build
docker compose -f docker-compose.yml -f compose.production.yml run --rm --no-deps --entrypoint bun docurama /app/node_modules/prisma/build/index.js db push --skip-generate
```

Export `DOCURAMA_BOOTSTRAP_EMAIL` in the operator session and pipe a fresh password from the approved secret manager into the packaged offline bootstrap:

```sh
secret-manager-read-command | docker compose -f docker-compose.yml -f compose.production.yml run --rm --no-deps -T -e DOCURAMA_BOOTSTRAP_EMAIL --entrypoint bun docurama /app/bootstrap-admin.js --empty-installation
```

Replace `secret-manager-read-command` with the actual approved command. Use a unique 16–256 character password containing uppercase, lowercase and digits; never place it in arguments or committed files. Bootstrap refuses databases containing any user or tenant. It cannot reset an existing password, does not create a tenant and never runs automatically. See [bootstrap details](docs/INSTALLATION-BOOTSTRAP.md) and [Docker one-off commands](https://docs.docker.com/reference/cli/docker/compose/run/).

After the approved deployment, sign in as the administrator. Create the first organization through authenticated `POST /api/workspace/settings` using `{"op":"org.create","data":{"name":"Your organization"}}`, configure SMTP and invite the organization owner/members. Dedicated mode refuses every subsequent tenant creation. Confirm uninvited signup is rejected and a valid invitation succeeds before opening access.

## Updates, backup and rollback

1. Pin the reviewed application/image version and record the current schema, tenant count and storage backend. Encrypt database/storage backups and prove an isolated restore. A running SQLite database requires its backup API or stopping the application; copying only `custom.db` during WAL writes is not a consistent backup.
2. Apply the candidate schema/image to an isolated restored copy first. This release adds SSO state and payment-related tables/columns. Retain existing data rather than replacing it with upstream fixtures. Never use `prisma db push --accept-data-loss`, `db reset` or demo seeding on production.
3. The entrypoint executes `prisma db push --skip-generate` and refuses to start on schema failure. Resolve failures through a reviewed migration. Use `DOCURAMA_SKIP_DB_PUSH=1` only after a separate successful schema step.
4. Verify health, login, revoked-session rejection, tenant boundaries, invitations, verification mail, documents, signing evidence and restore behavior. Complete provider browser checks and approved payment test events where configured.
5. Roll back with the pinned prior image and a database/storage snapshot proven compatible with it. Image rollback does not reverse schema or data changes.

The image does not guarantee a `sqlite3` CLI. Use an approved host tool or dedicated backup container instead of assuming `docker exec ... sqlite3` is available. Recovery also requires keys, configuration and any object-store contents.

## Validation and release gates

Local regressions use fresh temporary schemas and stub IdP/payment/CAPTCHA services; they do not mutate retained `db/custom.db`. CI builds a production image and exercises HTTP/browser flows. Passing checks does not prove a customer deployment, external IdP/Cloudflare browser behavior, production SMTP, payment activation, offline PDF validation or restore drill. Record installation-specific evidence before promotion and deployment. See [SSO](docs/SSO.md), [security](docs/SECURITY.md) and [go-live checklist](docs/GO-LIVE-CHECKLIST.md).
