import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { milestonesSchema } from "@/features/sales/schema";
import { replaceMilestones } from "@/features/sales/service";

export async function PUT(request: Request, ctx: RouteContext<"/api/sales/[id]/milestones">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { milestones } = milestonesSchema.parse(await readJson(request));
    await replaceMilestones(uuid.parse((await ctx.params).id), milestones, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
