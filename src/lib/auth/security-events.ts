import "server-only";
import { db } from "@/lib/db";

export type SecurityEvent =
  | "login_ok" | "login_failed" | "login_locked" | "password_changed" | "password_change_failed" | "logout";

/** Best-effort audit trail of sign-in and account-security activity. Never lets a logging failure block the request. */
export async function recordSecurityEvent(event: SecurityEvent, ctx: { userId?: string | null; email?: string; ip?: string; userAgent?: string }) {
  try {
    await db.query("INSERT INTO security_events (user_id, email_hint, event, ip, user_agent) VALUES ($1, $2, $3, $4, $5)", [
      ctx.userId ?? null, ctx.email?.slice(0, 254) ?? null, event, ctx.ip ?? null, ctx.userAgent ?? null,
    ]);
  } catch (e) {
    console.error("security event not recorded", event, e);
  }
}
