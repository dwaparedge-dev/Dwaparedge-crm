import { NextResponse } from "next/server";
import { assertSameOrigin, clientIp, errorResponse, readJson, userAgent } from "@/lib/http";
import { recordSecurityEvent } from "@/lib/auth/security-events";
import { getCurrentUser } from "@/lib/auth/current-user";
import { revokeSessions } from "@/lib/auth/login";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    // { everywhere: false } (used by the idle timeout) only ends this browser's session; the default ends all of them.
    const everywhere = ((await readJson(request).catch(() => ({}))) as { everywhere?: boolean } | null)?.everywhere !== false;
    const user = await getCurrentUser();
    if (user) {
      if (everywhere) await revokeSessions(user.id);
      await recordSecurityEvent("logout", { userId: user.id, email: user.email, ip: clientIp(request), userAgent: userAgent(request) });
    }
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
