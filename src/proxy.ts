import { NextResponse, type NextRequest } from "next/server";
import { getIronSession } from "iron-session";
import { sessionOptions, type SessionData } from "@/lib/session";

// Routes that do NOT require a fully-authenticated session (password + 2FA).
// Everything else (every page and every API route not listed here) is
// treated as protected by default, which is the safer failure mode: a new
// route added later is private unless someone deliberately opens it up.
const PUBLIC_PATHS = [
  "/login",
  "/setup",
  "/api/auth/login",
  "/api/auth/verify-2fa",
  "/api/setup",
];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"));
}

function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function buildCsp(nonce: string): string {
  // React needs eval() in development only (to rebuild server error stacks
  // in the browser); production never uses it, so it stays forbidden there.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";
  return [
    "default-src 'self'",
    // 'strict-dynamic' + nonce lets Next.js's own hydration/RSC inline
    // scripts run (it auto-detects the nonce in this header) while still
    // rejecting any script an attacker might inject without it.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${devEval}`,
    // Inline `style="..."` attributes (used extensively by React and by
    // Recharts for chart positioning/colors) aren't covered by nonces:
    // CSP has no nonce mechanism for the style attribute, only for <style>
    // elements. So this stays 'unsafe-inline'. Style injection is a much
    // lower-severity risk than script injection.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data:", // data: needed for the TOTP QR code image
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
}

function applySecurityHeaders(res: NextResponse, isHttps: boolean, csp: string): NextResponse {
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("Referrer-Policy", "no-referrer");
  res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  if (isHttps) {
    res.headers.set("Strict-Transport-Security", "max-age=63072000; includeSubDomains");
  }
  return res;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isHttps =
    process.env.COOKIE_SECURE === "true" || request.headers.get("x-forwarded-proto") === "https";

  const nonce = generateNonce();
  const csp = buildCsp(nonce);

  // Forward the nonce to Server Components (via `headers()`) so our own
  // inline <script> (the theme-init snippet in layout.tsx) can carry it too.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  if (isPublicPath(pathname)) {
    return applySecurityHeaders(NextResponse.next({ request: { headers: requestHeaders } }), isHttps, csp);
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  const session = await getIronSession<SessionData>(request, res, sessionOptions);

  if (!session.userId) {
    if (pathname.startsWith("/api/")) {
      return applySecurityHeaders(NextResponse.json({ error: "Non authentifié." }, { status: 401 }), isHttps, csp);
    }
    const loginUrl = new URL("/login", request.url);
    return applySecurityHeaders(NextResponse.redirect(loginUrl), isHttps, csp);
  }

  return applySecurityHeaders(res, isHttps, csp);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg).*)"],
};
