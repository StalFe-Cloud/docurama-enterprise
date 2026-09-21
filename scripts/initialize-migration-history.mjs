import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const old = readFileSync("prisma/baselines/release-20260920.prisma");
if (createHash("sha1").update(`blob ${old.length}\0`).update(old).digest("hex") !== "c79ff956959ac6d06deb28b67f98819a7476de76") throw new Error("Release baseline mismatch");
const current = readFileSync("prisma/schema.prisma", "utf8");
const work = mkdtempSync(join(tmpdir(), "docurama-migration-plan-"));
try {
  for (const provider of ["sqlite", "postgresql"]) {
    const root = `prisma/${provider}/migrations`;
    if (existsSync(root)) throw new Error(`Refusing to rewrite migration history: ${root}`);
    const rewrite = (s) => s.replace(/(datasource\s+db\s*\{[^}]*?provider\s*=\s*")[a-z]+(")/s, `$1${provider}$2`);
    const before = join(work, `before-${provider}.prisma`), after = join(work, `after-${provider}.prisma`);
    writeFileSync(before, rewrite(old.toString("utf8"))); writeFileSync(after, rewrite(current));
    const cli = (...args) => execFileSync(process.execPath, ["node_modules/prisma/build/index.js", ...args], {
      encoding: "utf8", env: { ...process.env, DATABASE_URL: provider === "sqlite" ? "file:/tmp/unused-migration-plan.db" : "postgresql://unused:unused@localhost:5432/unused" },
    });
    const base = cli("migrate", "diff", "--from-empty", "--to-schema-datamodel", before, "--script");
    const delta = cli("migrate", "diff", "--from-schema-datamodel", before, "--to-schema-datamodel", after, "--script");
    for (const [name, sql] of [["0_release_baseline", base], ["20260920_quality_hardening", delta]]) {
      const dir = join(root, name); mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "migration.sql"), sql);
    }
    writeFileSync(join(root, "migration_lock.toml"), `provider = "${provider}"\n`);
  }
} finally { rmSync(work, { recursive: true, force: true }); }
