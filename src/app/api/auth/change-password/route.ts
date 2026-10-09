import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, clientIp, errorResponse, readJson, userAgent } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { changePassword } from "@/lib/auth/login";
import { setSessionCookie } from "@/lib/auth/session";

const body = z.object({ currentPassword: z.string().min(1).max(200), newPassword: z.string().min(1).max(200) });

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { currentPassword, newPassword } = body.parse(await readJson(request));
    await setSessionCookie(await changePassword(user.id, currentPassword, newPassword, { ip: clientIp(request), userAgent: userAgent(request) }));
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
