"use client";

/**
 * Cookie notice (informational, not a consent wall).
 *
 * Docurama sets only essential and functional cookies: the sign-in session
 * (docurama_session), a language preference (NEXT_LOCALE) and a sidebar-state
 * cookie. There are no analytics, advertising or third-party tracking cookies,
 * so there is nothing to opt in or out of - the notice says exactly that and
 * links the Privacy Policy for the details. Dismissal is remembered locally.
 */

import { useState } from "react";
import Link from "next/link";
import { Cookie, X } from "lucide-react";

const KEY = "docurama.cookie-notice.dismissed.v1";

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(KEY) === "1";
  } catch {
    /* private mode: show the notice, it is harmless */
    return false;
  }
}

export function CookieNotice() {
  // Server renders nothing (no localStorage); the notice appears on hydration
  // unless previously dismissed - no layout shift risk on public pages since
  // it is a fixed overlay.
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);
  if (!checked) {
    setChecked(true);
    setShow(!readDismissed());
  }

  if (!show) return null;

  return (
    <aside
      role="note"
      aria-label="Cookie information"
      className="fixed inset-x-0 bottom-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/85"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="flex items-start gap-2.5 text-xs leading-relaxed text-muted-foreground sm:items-center">
          <Cookie className="mt-0.5 h-4 w-4 shrink-0 sm:mt-0" aria-hidden />
          <span>
            Docurama uses essential cookies to keep you signed in and functional cookies to remember
            your language and layout. No analytics, no advertising, no third-party tracking.{" "}
            <Link className="font-medium underline underline-offset-2 hover:text-foreground" href="/privacy">
              Read the Privacy Policy
            </Link>
          </span>
        </p>
        <button
          type="button"
          onClick={() => {
            try { window.localStorage.setItem(KEY, "1"); } catch { /* ignore */ }
            setShow(false);
          }}
          className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border px-3 text-xs font-medium transition-colors hover:bg-muted"
        >
          <X className="h-3.5 w-3.5" aria-hidden /> Got it
        </button>
      </div>
    </aside>
  );
}
