import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { getCurrentUser } from "@/lib/auth/current-user";
import { revokeSessions } from "@/lib/auth/login";
import { clearSessionCookie } from "@/lib/auth/session";

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await getCurrentUser();
    if (user) await revokeSessions(user.id);
    await clearSessionCookie();
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
