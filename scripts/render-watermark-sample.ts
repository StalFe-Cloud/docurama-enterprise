/** Render a sample watermarked page for visual inspection (self-contained). */

/** Same minimal-PDF generator the seed uses (e2e/seed.ts). */
function minimalPdf(pageLabels: string[]): Buffer {
  const objects: string[] = [];
  const pageIds: number[] = [];
  const firstPage = 4;
  pageLabels.forEach((_, i) => pageIds.push(firstPage + i * 2));

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageLabels.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";

  pageLabels.forEach((label, i) => {
    const pageId = pageIds[i];
    const contentId = pageId + 1;
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ` +
      `/Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`;
    const text = `Docurama E2E fixture - ${label}`;
    const escaped = text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
    const stream = `BT /F1 24 Tf 72 770 Td (${escaped}) Tj 0 -40 Td (${pageLabels.length} page document) Tj ET`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream)} >>\nstream\n${stream}\nendstream`;
  });

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id++) {
    if (!objects[id]) throw new Error(`missing object ${id}`);
    offsets[id] = Buffer.byteLength(out);
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out);
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

async function main() {
  const { renderPage } = await import("../src/lib/docintel/text-extract");
  const { drawPreviewWatermark, watermarkFor } = await import("../src/lib/preview-watermark");
  const { writeFile } = await import("fs/promises");

  const pdf = minimalPdf(["Mutual NDA - page 1 of 3"]);
  const png = await renderPage(new Uint8Array(pdf), 1, 150, (ctx, w, h) =>
    drawPreviewWatermark(ctx, w, h, watermarkFor({
      name: "Fixture Signer",
      email: "fixture-signer@example.com",
      code: "DOC-E2E0001",
    })),
  );
  const out = "/home/z/my-project/download/watermark-sample.png";
  await writeFile(out, png);
  console.log(`written: ${out} (${png.length} bytes)`);
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
