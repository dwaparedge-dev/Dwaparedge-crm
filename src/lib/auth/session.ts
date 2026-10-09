import "server-only";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { getEnv } from "@/lib/env";

export const SESSION_COOKIE = "de_session";

export interface SessionPayload {
  userId: string;
  tokenVersion: number;
}

function key() {
  return new TextEncoder().encode(getEnv().JWT_SECRET);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const days = getEnv().JWT_EXPIRES_IN_DAYS;
  return new SignJWT({ tv: payload.tokenVersion })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(payload.userId)
    .setIssuedAt()
    .setExpirationTime(`${days}d`)
    .sign(key());
}

export async function verifySession(token: string | undefined): Promise<SessionPayload | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub || typeof payload.tv !== "number") return null;
    return { userId: payload.sub, tokenVersion: payload.tv };
  } catch {
    return null;
  }
}

export async function setSessionCookie(token: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: getEnv().JWT_EXPIRES_IN_DAYS * 24 * 60 * 60,
  });
}

export async function clearSessionCookie() {
  (await cookies()).delete(SESSION_COOKIE);
}

export async function readSession(): Promise<SessionPayload | null> {
  return verifySession((await cookies()).get(SESSION_COOKIE)?.value);
}
