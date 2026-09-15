import { NextRequest, NextResponse } from "next/server";

/**
 * Host-aware routing for the docurama.eu production sub-domains.
 *
 *   status.docurama.eu    any path  → /status          (public status page)
 *   docs.docurama.eu      any path  → /docs            (documentation)
 *   security.docurama.eu  any path  → /security        (security hub)
 *   verify.docurama.eu    /         → /verify          (public verification)
 *   mta-sts.docurama.eu   any path  → /.well-known/mta-sts.txt (RFC 8460)
 *   api.docurama.eu       non-/api  → /api             (API index)
 *   admin.docurama.eu     /         → /admin           (admin console, auth-gated)
 *   mail.docurama.eu      /         → /mail            (mail service page)
 *   app. / staging. / apex / www / localhost: untouched (handled by page.tsx)
 *
 * Requests to /api/*, /_next/*, static files and well-known paths always
 * pass through so health checks and API clients keep working on every host.
 */

const SUBDOMAIN_ROUTES: Record<string, string> = {
  "status": "/status",
  "docs": "/docs",
  "security": "/security",
  "mta-sts": "/.well-known/mta-sts.txt",
};

const ROOT_ROUTES: Record<string, string> = {
  "verify": "/verify",
  "mail": "/mail",
};

function subdomain(host: string): string {
  const bare = host.toLowerCase().split(":")[0];
  if (!bare.endsWith(".docurama.eu")) return "";
  const label = bare.slice(0, -".docurama.eu".length);
  // apex, www, app, staging and empty are handled elsewhere
  return label;
}

export function middleware(req: NextRequest) {
  const label = subdomain(req.headers.get("host") ?? "");
  if (!label) return NextResponse.next();

  const { pathname, search } = req.nextUrl;

  // Never intercept infrastructure paths on any host.
  if (
    pathname.startsWith("/api") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/.well-known") ||
    pathname.includes(".")
  ) {
    return NextResponse.next();
  }

  // Whole-host surfaces.
  const whole = SUBDOMAIN_ROUTES[label];
  if (whole) {
    const url = req.nextUrl.clone();
    url.search = search;
    if (pathname === "/" || pathname === "") {
      url.pathname = whole;
      return NextResponse.rewrite(url);
    }
    if (pathname === whole || pathname.startsWith(whole + "/")) {
      return NextResponse.next();
    }
    // Deep-link rewrite: e.g. docs.docurama.eu/guide -> /docs/guide
    url.pathname = `${whole}${pathname.startsWith("/") ? "" : "/"}${pathname}`;
    return NextResponse.rewrite(url);
  }

  // Root-rewriting hosts: / maps to their surface, other paths pass through.
  const root = ROOT_ROUTES[label];
  if (root && (pathname === "/" || pathname === "")) {
    const url = req.nextUrl.clone();
    url.pathname = root;
    url.search = search;
    return NextResponse.rewrite(url);
  }

  // admin host: redirect / to the admin console so client-side routing
  // sees the real path (the portal derives its section from the URL).
  if (label === "admin" && (pathname === "/" || pathname === "")) {
    const url = req.nextUrl.clone();
    url.pathname = "/admin";
    return NextResponse.redirect(url);
  }

  // api host: everything that is not /api becomes the API index.
  if (label === "api") {
    const url = req.nextUrl.clone();
    url.pathname = "/api";
    url.search = "";
    return NextResponse.rewrite(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
