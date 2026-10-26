import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { demoRequestStatusSchema } from "@/features/demo-requests/schema";
import { setDemoRequestStatus } from "@/features/demo-requests/service";

export async function POST(request: Request, ctx: RouteContext<"/api/demo-requests/[id]/status">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await setDemoRequestStatus(uuid.parse((await ctx.params).id), demoRequestStatusSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
