#!/usr/bin/env bun
/// <reference types="bun-types" />

/** Offline operator bootstrap. Never invoke from an HTTP route or image startup. */
import { db } from "../src/lib/db";
import { hashPassword } from "../src/lib/auth";

export async function bootstrapAdmin(input: { email: string; password: string; firstName?: string; lastName?: string }) {
  const email = input.email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid bootstrap email is required");
  if (input.password.length < 16 || input.password.length > 256 ||
      !/[a-z]/.test(input.password) || !/[A-Z]/.test(input.password) || !/[0-9]/.test(input.password)) {
    throw new Error("Bootstrap password must be 16-256 characters with uppercase, lowercase and digits");
  }
  return db.$transaction(async (tx) => {
    // No account or tenant may pre-exist. This command cannot reset credentials
    // or escalate a live deployment's ordinary user into a platform admin.
    if (await tx.user.count() || await tx.tenant.count()) throw new Error("Bootstrap refused: the installation already contains users or tenants");
    const user = await tx.user.create({
      data: {
        email, passwordHash: hashPassword(input.password), role: "PLATFORM_ADMIN", status: "ACTIVE",
        firstName: input.firstName?.trim() || "Installation", lastName: input.lastName?.trim() || "Administrator",
      },
      select: { id: true, email: true },
    });
    await tx.auditEvent.create({
      data: { actor: email, actorRole: "PLATFORM_ADMIN", action: "installation.admin_bootstrapped", resource: `user:${user.id}`, severity: "WARNING", ip: "offline-operator", detail: "Initial platform administrator created by the offline operator on an empty installation" },
    });
    return user;
  });
}

async function main() {
  if (!process.argv.includes("--empty-installation")) throw new Error("Pass --empty-installation to initialize a new installation");
  if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL to the intended initialized database");
  const email = process.env.DOCURAMA_BOOTSTRAP_EMAIL ?? "";
  let password = process.env.DOCURAMA_BOOTSTRAP_PASSWORD;
  delete process.env.DOCURAMA_BOOTSTRAP_PASSWORD;
  if (!password) {
    if (process.stdin.isTTY) throw new Error("Supply the password through protected stdin or DOCURAMA_BOOTSTRAP_PASSWORD; command-line passwords are not accepted");
    password = (await Bun.stdin.text()).replace(/\r?\n$/, "");
  }
  await bootstrapAdmin({ email, password });
  password = "";
  console.log("Initial platform administrator created. Sign in, create the first organization, then configure invitations and email delivery.");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    // Do not echo provider/database errors that may contain connection details.
    const safe = error instanceof Error && /^(Bootstrap |A valid bootstrap|Pass --empty-installation|Set DATABASE_URL|Supply the password)/.test(error.message);
    console.error(safe ? (error as Error).message : "Bootstrap failed; verify the initialized database and operator configuration");
    process.exitCode = 1;
  }).finally(() => db.$disconnect());
}
