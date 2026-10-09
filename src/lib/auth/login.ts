import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hashPassword, verifyPassword } from "./password";
import { signSession } from "./session";
import { AppError, tooMany } from "./errors";

const WINDOW_MINUTES = 15;
const MAX_FAILURES = 5;
const MAX_FAILURES_PER_IP = 20;

const hashKey = (kind: string, value: string) =>
  createHash("sha256").update(`${getEnv().RATE_LIMIT_SALT}:${kind}:${value.toLowerCase()}`).digest("hex");

async function failures(keyHash: string): Promise<number> {
  const row = await db.queryOne<{ n: string }>(
    `SELECT count(*) AS n FROM login_attempts
     WHERE key_hash = $1 AND created_at > now() - make_interval(mins => $2)`,
    [keyHash, WINDOW_MINUTES],
  );
  return Number(row?.n ?? 0);
}

export async function login(email: string, password: string, ip: string): Promise<string> {
  const emailKey = hashKey("email", email);
  const ipKey = hashKey("ip", ip);

  // Housekeeping: the attempts table only needs the last window, so trim it now and then.
  if (Math.random() < 0.05) await db.query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");

  if ((await failures(emailKey)) >= MAX_FAILURES || (await failures(ipKey)) >= MAX_FAILURES_PER_IP) {
    throw tooMany();
  }

  const user = await db.queryOne<{ id: string; password_hash: string; token_version: number; is_active: boolean }>(
    "SELECT id, password_hash, token_version, is_active FROM users WHERE lower(email) = lower($1)",
    [email],
  );
  const ok = await verifyPassword(password, user?.password_hash ?? null);

  if (!user || !ok) {
    await db.query("INSERT INTO login_attempts (key_hash) VALUES ($1), ($2)", [emailKey, ipKey]);
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
  if (!user.is_active) {
    throw new AppError("This account has been deactivated", 403, "ACCOUNT_DEACTIVATED");
  }

  await db.query("DELETE FROM login_attempts WHERE key_hash = $1", [emailKey]);
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  return signSession({ userId: user.id, tokenVersion: user.token_version });
}

/** Revokes every existing session for the user. */
export async function revokeSessions(userId: string): Promise<void> {
  await db.query("UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1", [userId]);
}

const MIN_PASSWORD_LENGTH = 12;

/** Changes the caller's own password, ends every other session and returns a fresh token for this one. */
export async function changePassword(userId: string, current: string, next: string): Promise<string> {
  if (next.length < MIN_PASSWORD_LENGTH) throw new AppError(`The new password must be at least ${MIN_PASSWORD_LENGTH} characters`, 422, "VALIDATION_ERROR");
  if (next === current) throw new AppError("The new password must be different from the current one", 422, "VALIDATION_ERROR");
  const user = await db.queryOne<{ password_hash: string }>("SELECT password_hash FROM users WHERE id = $1", [userId]);
  const ok = await verifyPassword(current, user?.password_hash ?? null);
  if (!user || !ok) throw new AppError("The current password is incorrect", 403, "INVALID_CREDENTIALS");
  const row = await db.queryOne<{ token_version: number }>(
    "UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2 RETURNING token_version",
    [await hashPassword(next), userId],
  );
  return signSession({ userId, tokenVersion: row!.token_version });
}
