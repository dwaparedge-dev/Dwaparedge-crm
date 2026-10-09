import { NextResponse, type NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Optimistic redirect only. Real authorization happens in the server layer
// (getCurrentUser re-checks the user row), never rely on this alone.
const COOKIE = "de_session";

async function hasValidToken(token: string | undefined): Promise<boolean> {
  const secret = process.env.JWT_SECRET;
  if (!token || !secret) return false;
  try {
    await jwtVerify(token, new TextEncoder().encode(secret), { algorithms: ["HS256"] });
    return true;
  } catch {
    return false;
  }
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
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
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/auth/login).*)"],
};
