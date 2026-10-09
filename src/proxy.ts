import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Optimistic redirect only. Real authorization happens in the server layer
// (getCurrentUser re-checks the user row), never rely on this alone.
import { SESSION_COOKIE as COOKIE } from "@/lib/auth/cookie-name";

async function hasValidToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;
  try {
    const { payload } = await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return typeof payload.tv === "number";
  } catch {
    return false;
  }
}

// Best-effort flood brake per server instance (instances do not share memory, so the Vercel Firewall rule in
// docs/SECURITY.md is the real limit). It still stops a single address hammering one instance.
const WINDOW_MS = 60_000;
const hits = new Map<string, { n: number; resetAt: number }>();
function overLimit(key: string, max: number): boolean {
  const now = Date.now();
  if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt < now) hits.delete(k);
  const h = hits.get(key);
  if (!h || h.resetAt < now) {
    hits.set(key, { n: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  return ++h.n > max;
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith("/api/")) {
    const ip = request.headers.get("x-vercel-forwarded-for")?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const isAuthRoute = pathname.startsWith("/api/auth/");
    const limited = isAuthRoute ? overLimit(`auth:${ip}`, 30) : request.method === "GET" ? overLimit(`read:${ip}`, 300) : overLimit(`write:${ip}`, 90);
    if (limited) {
      return NextResponse.json({ error: { code: "RATE_LIMITED", message: "Too many requests. Slow down and try again in a minute." } }, { status: 429, headers: { "Retry-After": "60" } });
    }
  }
  const authed = await hasValidToken(request.cookies.get(COOKIE)?.value);

  if (pathname === "/login") {
    return authed ? NextResponse.redirect(new URL("/", request.url)) : NextResponse.next();
  }
  if (!authed) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Authentication required" } }, { status: 401 });
    }
    const url = new URL("/login", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  // The manifest and app icons must load before sign-in, or the browser cannot install the app.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|manifest.webmanifest|icon-.*\\.png|apple-touch-icon\\.png|api/auth/login).*)"],
};
