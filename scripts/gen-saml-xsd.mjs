/**
 * Regenerates src/lib/saml-xsd.ts — the SAML 2.0 / XML-DSig / XML-Enc schemas
 * embedded as string constants for the samlify schema validator.
 *
 * The schemas are vendored from @authenio/samlify-xmllint-wasm (MIT), the
 * official samlify validator module, which in turn carries them from the OASIS
 * SAML 2.0 and W3C XML Signature / XML Encryption specifications. We embed
 * rather than depend on that package because it pins xmllint-wasm ^4 (we run
 * ^5), re-reads all six files from disk on every single validation call, and
 * collapses xmllint's diagnostics into a generic ERR_EXCEPTION_VALIDATE_XML.
 *
 * Usage:
 *   npm pack @authenio/samlify-xmllint-wasm && tar xzf authenio-*.tgz
 *   node scripts/gen-saml-xsd.mjs ./package/schemas
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("usage: node scripts/gen-saml-xsd.mjs <path-to-schemas-dir>");
  process.exit(1);
}
const target = join(process.cwd(), "src", "lib", "saml-xsd.ts");

// Order matters: [0] is handed to xmllint as --schema, the rest are preloaded
// into the WASM filesystem so that schema's <import>/<include> schemaLocation
// references (which are relative filenames) resolve.
const FILES = [
  "saml-schema-protocol-2.0.xsd",
  "datatypes.dtd",
  "saml-schema-assertion-2.0.xsd",
  "xmldsig-core-schema.xsd",
  "XMLSchema.dtd",
  "xenc-schema.xsd",
];

const entries = FILES.map((file) => {
  const contents = readFileSync(join(source, file), "utf-8").replace(/\r\n/g, "\n");
  return `  { fileName: ${JSON.stringify(file)}, contents: ${JSON.stringify(contents)} },`;
}).join("\n");

writeFileSync(target, `// GENERATED FILE — do not edit by hand.
//
// The SAML 2.0 / XML-DSig / XML-Enc schemas, embedded as string constants.
//
// Why embedded rather than read from disk: scripts/package-standalone.mjs
// copies only .next/static, public, tessdata and content into the standalone
// image, so anything read from src/ at runtime is absent in production. These
// are also read on the SSO callback request path, where per-call file I/O
// would be wasted work.
//
// Source: @authenio/samlify-xmllint-wasm@1.0.1 (MIT, Copyright (c) 2023
// Authen), which vendors them from the OASIS SAML 2.0 and W3C XML Signature /
// XML Encryption specifications. Regenerate with scripts/gen-saml-xsd.mjs.
//
// Entry 0 is the schema; entries 1..n are preloaded so its imports resolve.

export interface SamlSchemaFile {
  readonly fileName: string;
  readonly contents: string;
}

export const SAML_SCHEMA_FILES: readonly SamlSchemaFile[] = [
${entries}
];
`);
console.log(`wrote ${target} (${FILES.length} schema files)`);
