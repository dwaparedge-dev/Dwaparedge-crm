import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { snoozeSchema } from "@/features/tasks/schema";
import { snoozeTask } from "@/features/tasks/follow-ups";

export async function POST(request: Request, ctx: RouteContext<"/api/tasks/[id]/snooze">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await snoozeTask(uuid.parse((await ctx.params).id), snoozeSchema.parse(await readJson(request)), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
