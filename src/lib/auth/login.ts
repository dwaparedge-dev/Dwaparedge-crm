import "server-only";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { hashPassword, verifyPassword } from "./password";
import { passwordProblem } from "./password-policy";
import { signSession } from "./session";
import { recordSecurityEvent } from "./security-events";
import { AppError, tooMany } from "./errors";

const WINDOW_MINUTES = 15;
// An attacker from one address is stopped after 5 tries at one account; the account-wide and address-wide caps are
// higher, so a stranger cannot lock the real person out just by guessing their email.
const MAX_FAILURES_PER_PAIR = 5;
const MAX_FAILURES_PER_EMAIL = 25;
const MAX_FAILURES_PER_IP = 20;
const MAX_FAILURES_OTHER = 5;

export interface RequestContext {
  ip: string;
  userAgent: string;
}

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

/** Throws 429 when `key` already has too many recent failures. */
async function assertNotLocked(key: string, max = MAX_FAILURES_OTHER) {
  if ((await failures(key)) >= max) throw tooMany();
}
const noteFailure = (...keys: string[]) =>
  db.query(`INSERT INTO login_attempts (key_hash) SELECT unnest($1::text[])`, [keys]);
const clearFailures = (key: string) => db.query("DELETE FROM login_attempts WHERE key_hash = $1", [key]);

/** Checks the credentials and returns a session token. */
export async function login(email: string, password: string, ctx: RequestContext): Promise<string> {
  const pairKey = hashKey("pair", `${email}|${ctx.ip}`);
  const emailKey = hashKey("email", email);
  const ipKey = hashKey("ip", ctx.ip);

  // Housekeeping: the attempts table only needs the last window, so trim it now and then.
  if (Math.random() < 0.05) await db.query("DELETE FROM login_attempts WHERE created_at < now() - interval '1 day'");
  if (Math.random() < 0.02) await db.query("DELETE FROM security_events WHERE created_at < now() - interval '180 days'");

  if ((await failures(pairKey)) >= MAX_FAILURES_PER_PAIR || (await failures(emailKey)) >= MAX_FAILURES_PER_EMAIL || (await failures(ipKey)) >= MAX_FAILURES_PER_IP) {
    await recordSecurityEvent("login_locked", { email, ...ctx });
    throw tooMany();
  }

  const user = await db.queryOne<{ id: string; password_hash: string; token_version: number; is_active: boolean }>(
    "SELECT id, password_hash, token_version, is_active FROM users WHERE lower(email) = lower($1)",
    [email],
  );
  const ok = await verifyPassword(password, user?.password_hash ?? null);

  if (!user || !ok) {
    await noteFailure(pairKey, emailKey, ipKey);
    await recordSecurityEvent("login_failed", { userId: user?.id, email, ...ctx });
    throw new AppError("Invalid email or password", 401, "INVALID_CREDENTIALS");
  }
  if (!user.is_active) {
    throw new AppError("This account has been deactivated", 403, "ACCOUNT_DEACTIVATED");
  }

  await clearFailures(pairKey);
  await db.query("UPDATE users SET last_login_at = now() WHERE id = $1", [user.id]);
  await recordSecurityEvent("login_ok", { userId: user.id, email, ...ctx });
  return signSession({ userId: user.id, tokenVersion: user.token_version });
}

/** Revokes every existing session for the user. */
export async function revokeSessions(userId: string): Promise<void> {
  await db.query("UPDATE users SET token_version = token_version + 1, updated_at = now() WHERE id = $1", [userId]);
}

/** Changes the caller's own password, ends every other session and returns a fresh token for this one. */
export async function changePassword(userId: string, current: string, next: string, ctx: RequestContext): Promise<string> {
  const me = await db.queryOne<{ password_hash: string; email: string }>("SELECT password_hash, email FROM users WHERE id = $1", [userId]);
  const problem = passwordProblem(next, me?.email);
  if (problem) throw new AppError(problem, 422, "VALIDATION_ERROR");
  if (next === current) throw new AppError("The new password must be different from the current one", 422, "VALIDATION_ERROR");
  // Same brake as sign-in, so a hijacked session cannot be used to guess the current password.
  const key = hashKey("password-change", userId);
  await assertNotLocked(key);
  const ok = await verifyPassword(current, me?.password_hash ?? null);
  if (!me || !ok) {
    await noteFailure(key);
    await recordSecurityEvent("password_change_failed", { userId, ...ctx });
    throw new AppError("The current password is incorrect", 403, "INVALID_CREDENTIALS");
  }
  await clearFailures(key);
  const row = await db.queryOne<{ token_version: number }>(
    "UPDATE users SET password_hash = $1, token_version = token_version + 1, updated_at = now() WHERE id = $2 RETURNING token_version",
    [await hashPassword(next), userId],
  );
  await recordSecurityEvent("password_changed", { userId, ...ctx });
  return signSession({ userId, tokenVersion: row!.token_version });
}
