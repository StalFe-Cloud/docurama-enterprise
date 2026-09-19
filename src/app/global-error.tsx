"use client";

/** Root-layout failures need their own document and no app providers or styles. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#fff", color: "#1a1a1a" }}>
        <main style={{ maxWidth: 640, margin: "0 auto", padding: "80px 24px" }} role="alert">
          <h1 style={{ fontSize: 28 }}>Docurama could not load this page</h1>
          <p style={{ lineHeight: 1.6 }}>
            Try again. If the problem continues, contact your administrator or support@docurama.eu.
          </p>
          {error.digest && <p style={{ fontFamily: "monospace", fontSize: 12 }}>Reference: {error.digest}</p>}
          <button type="button" onClick={reset} style={{ padding: "10px 18px", cursor: "pointer" }}>Try again</button>
          <a href="/" style={{ marginLeft: 20 }}>Go to home</a>
        </main>
      </body>
    </html>
  );
}
