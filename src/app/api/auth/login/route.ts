import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, clientIp, errorResponse } from "@/lib/http";
import { login } from "@/lib/auth/login";
import { setSessionCookie } from "@/lib/auth/session";

const body = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const input = body.parse(await request.json());
    const token = await login(input.email, input.password, clientIp(request));
    await setSessionCookie(token);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
