import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { updatePrioritySchema } from "@/features/tasks/config-schema";
import { deleteConfig, updateConfig } from "@/features/tasks/config-service";

/** Rename, recolour, reorder, hide or show. Needs `tasks.manage_settings`; the service checks. */
export async function PATCH(request: Request, ctx: RouteContext<"/api/task-priorities/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateConfig("priorities", uuid.parse((await ctx.params).id), updatePrioritySchema.parse(await readJson(request)), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

/** Refused (409) for starter rows and rows that tasks use; hide those instead. */
export async function DELETE(request: Request, ctx: RouteContext<"/api/task-priorities/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await deleteConfig("priorities", uuid.parse((await ctx.params).id), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
