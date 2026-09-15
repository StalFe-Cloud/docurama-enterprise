"use client";

/**
 * Portal API client.
 *
 * Fix for the original api.ts bug class: every response is checked with
 * `res.ok` BEFORE parsing, so failed mutations can never be reported as
 * successes and 404 lookups can never render as "unsigned document".
 */

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/** localStorage key for the bearer session token. */
export const SESSION_TOKEN_STORE = "docurama_token";

/** Persist the bearer token returned by a successful sign-in. */
export function setSessionToken(token: string) {
  try {
    window.localStorage.setItem(SESSION_TOKEN_STORE, token);
  } catch {
    // Storage unavailable (private mode) - cookie flow still applies.
  }
}

/** Drop the bearer token (sign-out). */
export function clearSessionToken() {
  try {
    window.localStorage.removeItem(SESSION_TOKEN_STORE);
  } catch {
    // Ignore - nothing to clean up.
  }
}

/** `Authorization` header when a bearer token is stored, else `{}`. */
function authHeaders(): Record<string, string> {
  try {
    const token = window.localStorage.getItem(SESSION_TOKEN_STORE);
    return token ? { authorization: `Bearer ${token}` } : {};
  } catch {
    return {};
  }
}

async function handle<T>(res: Response): Promise<T> {
  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (e.g. empty 500) - fall through to error handling.
  }
  if (!res.ok) {
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : `Request failed (HTTP ${res.status})`;
    throw new ApiError(message, res.status);
  }
  return body as T;
}

export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { credentials: "same-origin", headers: authHeaders() });
  return handle<T>(res);
}

export async function apiPost<T>(path: string, body: { op: string; id?: string; data?: Record<string, unknown> }): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "content-type": "application/json", ...authHeaders() },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return handle<T>(res);
}

export async function apiUpload<T>(path: string, formData: FormData): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { ...authHeaders() },
    credentials: "same-origin",
    body: formData,
  });
  return handle<T>(res);
}

