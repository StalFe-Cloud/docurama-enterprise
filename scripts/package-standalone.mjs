import { cpSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const destination = join(process.cwd(), ".next", "standalone");
mkdirSync(join(destination, ".next"), { recursive: true });
for (const [source, target] of [[".next/static", ".next/static"], ["public", "public"], ["tessdata", "tessdata"], ["content", "content"]]) {
  cpSync(source, join(destination, target), { recursive: true });
}
