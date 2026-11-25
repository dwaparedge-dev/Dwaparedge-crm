import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { markDemoRequestTaskContacted } from "@/features/tasks/demo-request-task";

export async function POST(request: Request, ctx: RouteContext<"/api/tasks/[id]/mark-contacted">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await markDemoRequestTaskContacted(uuid.parse((await ctx.params).id), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
