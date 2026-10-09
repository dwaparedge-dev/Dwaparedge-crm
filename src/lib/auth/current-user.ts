import "server-only";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { readSession } from "./session";
import { unauthorized } from "./errors";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/** Validates the cookie AND re-checks the user row (active, token_version). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await readSession();
  if (!session) return null;
  const user = await db.queryOne<CurrentUser & { token_version: number; is_active: boolean }>(
    "SELECT id, name, email, token_version, is_active FROM users WHERE id = $1",
    [session.userId],
  );
  if (!user || !user.is_active || user.token_version !== session.tokenVersion) return null;
  return { id: user.id, name: user.name, email: user.email };
}

/** For pages/layouts: redirects to /login when unauthenticated. */
export async function requireUserPage(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}

/** For route handlers / services: throws a 401 AppError. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}
