# Tesseract language data

Bundled, not fetched. tesseract.js downloads these from a CDN by default; the
product's positioning is EU data residency with no third-party document egress,
and a build that reaches out to a CDN also cannot run offline. The OCR worker
is configured with `langPath` pointing here.

These are server-side only, so they deliberately do not live in `public/` -
there is no reason to serve 6 MB of model data to browsers.

| File | Language | Source |
|---|---|---|
| `eng.traineddata` | English | tessdata_fast, via tesseract.js |
| `fra.traineddata` | French  | tessdata_fast, via tesseract.js |

Adding a language (`deu`, `ita`, `nld`, `spa`) is a drop-in: put the
`.traineddata` file here and add the code to the worker's language list.

The build script copies this directory into `.next/standalone/` so it ships
with the standalone server.
