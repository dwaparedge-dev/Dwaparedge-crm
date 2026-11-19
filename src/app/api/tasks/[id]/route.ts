import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { updateTaskSchema } from "@/features/tasks/schema";
import { getTask, updateTask } from "@/features/tasks/service";

/** The task with its history. A task the caller may not see is a 404 (the service checks). */
export async function GET(_req: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  try {
    const user = await requireUser();
    return NextResponse.json(await getTask(uuid.parse((await ctx.params).id), user));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Edit, including "Take it" (set the owner). The service checks the edit and assign rights. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/tasks/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateTask(uuid.parse((await ctx.params).id), updateTaskSchema.parse(await readJson(request)), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
