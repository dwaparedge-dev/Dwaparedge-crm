import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { followUpSchema } from "@/features/tasks/schema";
import { recordFollowUp } from "@/features/tasks/follow-ups";

export async function POST(request: Request, ctx: RouteContext<"/api/tasks/[id]/follow-up">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await recordFollowUp(uuid.parse((await ctx.params).id), followUpSchema.parse(await readJson(request)), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
