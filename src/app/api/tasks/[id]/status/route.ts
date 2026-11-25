import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { taskStatusSchema } from "@/features/tasks/schema";
import { setTaskStatus } from "@/features/tasks/service";

export async function POST(request: Request, ctx: RouteContext<"/api/tasks/[id]/status">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await setTaskStatus(uuid.parse((await ctx.params).id), taskStatusSchema.parse(await readJson(request)), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
