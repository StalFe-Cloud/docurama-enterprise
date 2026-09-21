/**
 * Emit a provider-specific Prisma schema from the single source of truth
 * (prisma/schema.prisma, which is the SQLite one).
 *
 *   node scripts/schema-for.mjs postgresql   -> prisma/schema.postgresql.prisma
 *   node scripts/schema-for.mjs sqlite       -> prisma/schema.sqlite.prisma
 *
 * Prisma cannot take `datasource.provider` from an environment variable, so the
 * provider has to be fixed before `prisma generate` runs — i.e. at build time.
 * One image therefore targets one provider.
 *
 * This replaces the inline `sed` that .github/workflows/e2e.yml used for its
 * postgres-portability job, so CI and local development share one code path.
 *
 * The provider line is the ONLY edit. That is the portability contract the
 * portability job asserts: if the schema ever needs provider-specific
 * attributes, this script fails loudly rather than silently diverging the two.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const PROVIDERS = ["sqlite", "postgresql"];

const target = process.argv[2];
if (!PROVIDERS.includes(target)) {
  console.error(`usage: node scripts/schema-for.mjs <${PROVIDERS.join("|")}>`);
  process.exit(1);
}

const root = process.cwd();
const sourcePath = join(root, "prisma", "schema.prisma");
const outPath = join(root, "prisma", `schema.${target}.prisma`);

const source = readFileSync(sourcePath, "utf-8");

const DATASOURCE_PROVIDER = /(datasource\s+db\s*\{[^}]*?provider\s*=\s*")([a-z]+)(")/s;
const match = source.match(DATASOURCE_PROVIDER);
if (!match) {
  console.error("schema-for: could not find the datasource provider in prisma/schema.prisma");
  process.exit(1);
}

const from = match[2];
const out = source.replace(DATASOURCE_PROVIDER, `$1${target}$3`);

/**
 * Guard the portability contract.
 *
 * Swapping the provider line is only sound while the schema avoids constructs
 * that mean something different (or nothing) on the other provider. These are
 * the ones that actually break a SQLite <-> PostgreSQL swap:
 *
 *   @db.*          native column types are provider-specific
 *   Unsupported()  raw provider types by definition
 *   dbgenerated()  provider-specific default expressions
 *   enum blocks    PostgreSQL has them, SQLite does not (this schema uses
 *                  String plus a comment listing the values, deliberately)
 *   scalar lists   String[]/Int[]/... are PostgreSQL-only; relation lists
 *                  (Member[], Envelope[]) are fine and must not be flagged
 *   @@index(type:) Gin/Gist/BRIN and friends are PostgreSQL-only
 *
 * Checked against the SOURCE schema, so it fails the same way whichever
 * direction you generate. An earlier version of this compared the input and
 * output line counts, which asserted nothing: the output is produced from the
 * input by replacing exactly one line, so the difference was always 1.
 */
const SCALARS = "String|Int|BigInt|Float|Decimal|Boolean|DateTime|Json|Bytes";
const NON_PORTABLE = [
  [/@db\.[A-Za-z]/, "@db.* native type attribute"],
  [/\bUnsupported\s*\(/, "Unsupported() raw provider type"],
  [/\bdbgenerated\s*\(/, "dbgenerated() default expression"],
  [/^\s*enum\s+\w+\s*\{/m, "enum block (unsupported on SQLite)"],
  [new RegExp(String.raw`^\s*\w+\s+(${SCALARS})\[\]`, "m"), "scalar list field (PostgreSQL-only)"],
  [/@@index\([^)]*\btype\s*:/, "@@index(type:) index method"],
];

const violations = NON_PORTABLE.filter(([re]) => re.test(source)).map(([, label]) => label);
if (violations.length) {
  console.error(
    "schema-for: prisma/schema.prisma uses constructs that are not portable across providers:\n" +
      violations.map((v) => `  - ${v}`).join("\n") +
      "\nA provider swap is no longer sufficient; the schemas must diverge properly.",
  );
  process.exit(1);
}

writeFileSync(outPath, out);
mkdirSync(join(root, "prisma", target), { recursive: true });
writeFileSync(join(root, "prisma", target, "schema.prisma"), out);
console.log(`schema-for: ${from} -> ${target}  (prisma/schema.${target}.prisma)`);
