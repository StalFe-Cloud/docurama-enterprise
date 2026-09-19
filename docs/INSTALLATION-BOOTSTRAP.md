# Initial administrator for dedicated installations

`DOCURAMA_DEPLOYMENT_MODE=selfhost` and `private_cloud` are invitation-only,
including when `DOCURAMA_PUBLIC_REGISTRATION=true`. Public signup never
initializes an installation. `DOCURAMA_PUBLIC_REGISTRATION=false` also closes
uninvited signup on SaaS installations.

For a new installation, an operator first initializes the schema on its
intended database using the deployment procedure. Do not seed demo accounts.
Then run the offline command from the application checkout/container with its
normal database access:

```sh
# Export DATABASE_URL and DOCURAMA_BOOTSTRAP_EMAIL in the operator session.
# Provide a secret-manager value through stdin; do not put the password in
# command-line arguments, shell history, a committed file, or deployment logs.
secret-manager-read-command | bun scripts/bootstrap-admin.ts --empty-installation
```

The production image packages the same command as `/app/bootstrap-admin.js`.
Inside that image, run `bun /app/bootstrap-admin.js --empty-installation` with
the same protected input and database environment. It is never run automatically.

`secret-manager-read-command` is a placeholder for the operator's configured
secret-manager CLI. Alternatively inject `DOCURAMA_BOOTSTRAP_PASSWORD` into
this one process from the secret manager. The password must contain 16-256
characters including uppercase, lowercase and digits. No password or token is
printed. The command uses the application's current password-hashing helper.
It never sends mail, creates a tenant, or changes deployment settings.

The command refuses any database that already contains a user or tenant. It
cannot reset an existing password or elevate an existing account. Administrator
creation and its audit record commit in one transaction. This command is not
called by the container entrypoint and has no unauthenticated HTTP equivalent.

Sign in with the new administrator, then create the first organization through
authenticated `POST /api/workspace/settings` with operation `org.create` and
`data.name`. A dedicated installation permits only a platform administrator to
create its first tenant and refuses every later tenant creation, including by
that administrator. Invite the organization's users through its owner/admin
settings. Valid mailbox-bound invitations continue to work while registration
is closed. Configure SMTP so invitation and verification links can be delivered.

The bootstrap and authorization regression tests run only on a new temporary
SQLite database: `bun test e2e/auth-security.test.ts`. No bootstrap was executed
against a real local or deployed database during this change.
