/**
 * Process the fresh StålFe product captures into web-weight brand assets.
 * Resizes to the dimensions the marketing page declares and optimizes PNGs.
 */
import sharp from "sharp";
import { statSync } from "node:fs";

async function run(src: string, dest: string, width: number, height: number) {
  const img = sharp(src);
  const meta = await img.metadata();
  await img
    .resize(width, height, { fit: "cover", position: "top" })
    .png({ compressionLevel: 9, palette: true })
    .toFile(dest);
  const out = await sharp(dest).metadata();
  console.log(`${dest}: ${meta.width}x${meta.height} -> ${out.width}x${out.height} (${(statSync(dest).size / 1024).toFixed(0)} KB)`);
}

async function main() {
  await run("/tmp/capture-docs2.png", "public/brand/product-documents.png", 1600, 1200);
  await run("/tmp/capture-verify2.png", "public/brand/product-verify.png", 1200, 900);
}

main().catch((e) => { console.error(e); process.exit(1); });
