import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { updateDemoRequestSchema } from "@/features/demo-requests/schema";
import { getDemoRequest, updateDemoRequest } from "@/features/demo-requests/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/demo-requests/[id]">) {
  try {
    await requireUser();
    return NextResponse.json(await getDemoRequest(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/demo-requests/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateDemoRequest(uuid.parse((await ctx.params).id), updateDemoRequestSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
