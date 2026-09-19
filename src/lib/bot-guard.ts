/**
 * Bot protection for public forms (go-live cycle) — the third deferred item
 * from cycle 10.
 *
 * Three independent layers, all server-side, zero client trust:
 *
 *  1. Honeypot — a hidden "website" field styled out of human reach. Real
 *     users never see it; naive bots fill every input they find.
 *  2. Time trap — the form posts the moment it rendered (client clock).
 *     A submission faster than MIN_FILL_MS is machine-speed; humans need at
 *     least a few seconds to type a name and an email.
 *  3. Cloudflare Turnstile (optional) — when TURNSTILE_SECRET_KEY is set,
 *     the token is verified against siteverify. Without the key the layer is
 *     skipped honestly (self-host deployments may front the app with their
 *     own protection instead).
 *
 * Per-IP rate limiting stays with each route (it needs route-specific
 * windows and responses).
 */

export const MIN_FILL_MS = 2_500;

export interface BotGuardVerdict {
  ok: boolean;
  /** HTTP status (200 when ok, 4xx for rejections). */
  status: 200 | 400 | 403;
  error: string;
}

export interface BotGuardInput {
  /** Honeypot field ("website") — must be EMPTY for humans. */
  website?: string;
  /** Client epoch-ms when the form rendered (hidden field). */
  formStartedAt?: number;
  /** Cloudflare Turnstile token (only when the site key is configured). */
  turnstileToken?: string;
  /** Remote IP for the Turnstile remoteip parameter. */
  ip?: string;
}

export async function checkBotGuard(input: BotGuardInput): Promise<BotGuardVerdict> {
  // 1. Honeypot: any content means a bot (or a very lost user agent).
  //    Active in every mode — even demo.
  if (String(input.website ?? "").trim() !== "") {
    return { ok: false, status: 403, error: "Request rejected" };
  }

  // 2. Time trap: machine-speed submissions are refused. Demo/E2E mode
  //    (NEXT_PUBLIC_DEMO_MODE=true) disables the timing check so scripted
  //    flows can drive the form; the honeypot above still applies.
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  const startedAt = Number(input.formStartedAt ?? 0);
  if (!demoMode) {
    if (Number.isFinite(startedAt) && startedAt > 0) {
      const elapsed = Date.now() - startedAt;
      // A timestamp from the far future (> 1h) means the field was forged.
      if (elapsed < -3_600_000) {
        return { ok: false, status: 403, error: "Request rejected" };
      }
      if (elapsed < MIN_FILL_MS) {
        return {
          ok: false,
          status: 400,
          error: `That was too fast — please take a moment to review your answers`,
        };
      }
    } else {
      // The field is absent entirely — old clients are fine, but scripted
      // posts that never rendered the form are not. Treat as bot.
      return { ok: false, status: 400, error: "Please reload the page and try again" };
    }
  }

  // 3. Turnstile (optional by configuration).
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (secret) {
    const token = String(input.turnstileToken ?? "").trim();
    if (!token || token.length > 2048) return { ok: false, status: 400, error: "Please complete the human verification" };
    const verdict = await verifyTurnstile(token, secret, input.ip);
    if (!verdict) return { ok: false, status: 403, error: "Human verification failed — please retry" };
  }

  return { ok: true, status: 200, error: "" };
}

async function verifyTurnstile(token: string, secret: string, ip?: string): Promise<boolean> {
  try {
    // TURNSTILE_SITEVERIFY_URL is a test seam (local stub); production uses
    // the Cloudflare endpoint.
    const endpoint = process.env.TURNSTILE_SITEVERIFY_URL ?? "https://challenges.cloudflare.com/turnstile/v0/siteverify";
    const res = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(ip ? { remoteip: ip } : {}) }),
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    // Network failure → fail closed for the CAPTCHA layer but let the other
    // guards decide? No: when Turnstile is explicitly configured, fail closed.
    return false;
  }
}

/** Client helper: the hidden fields every guarded form must post. */
export function botGuardFields(formStartedAt: number): Record<string, string | number> {
  return { website: "", formStartedAt };
}
