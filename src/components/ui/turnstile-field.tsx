"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";
export const TURNSTILE_ENABLED = Boolean(SITE_KEY);

type TurnstileApi = {
  render: (container: HTMLElement, options: {
    sitekey: string;
    callback: (token: string) => void;
    "expired-callback": () => void;
    "error-callback": () => void;
    "timeout-callback": () => void;
    "response-field": boolean;
  }) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window { turnstile?: TurnstileApi }
}

/** One widget per form, with explicit token expiry and single-use retry handling. */
export function TurnstileField({ onToken, resetKey = 0 }: {
  onToken: (token: string) => void;
  resetKey?: number;
}) {
  const container = useRef<HTMLDivElement>(null);
  const widget = useRef<string | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!SITE_KEY || !ready || !container.current || !window.turnstile) return;
    onToken("");
    const unavailable = () => {
      onToken("");
      setError("Human verification could not finish. Please retry.");
    };
    try {
      widget.current = window.turnstile.render(container.current, {
        sitekey: SITE_KEY,
        "response-field": false,
        callback: (token) => { setError(""); onToken(token); },
        "expired-callback": () => { onToken(""); setError("Human verification expired. Please retry."); },
        "error-callback": unavailable,
        "timeout-callback": unavailable,
      });
    } catch {
      unavailable();
    }
    return () => {
      if (widget.current) window.turnstile?.remove(widget.current);
      widget.current = null;
    };
  }, [ready, onToken, resetKey]);

  if (!SITE_KEY) return null;
  return (
    <div className="space-y-2" aria-label="Human verification">
      <Script
        id="cloudflare-turnstile"
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={() => setReady(true)}
        onError={() => { onToken(""); setError("Human verification could not load. Check your connection and reload the page."); }}
      />
      <div ref={container} />
      {!ready && !error && <p role="status" className="text-xs text-muted-foreground">Loading human verification…</p>}
      {error && (
        <div role="alert" className="space-y-1 text-sm text-destructive">
          <p>{error}</p>
          <button type="button" className="underline underline-offset-2" onClick={() => {
            onToken("");
            if (widget.current && window.turnstile) { setError(""); window.turnstile.reset(widget.current); }
            else window.location.reload();
          }}>Retry verification</button>
        </div>
      )}
    </div>
  );
}
