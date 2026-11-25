import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { noteSchema } from "@/features/tasks/schema";
import { addTaskNote } from "@/features/tasks/service";

export async function POST(request: Request, ctx: RouteContext<"/api/tasks/[id]/notes">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await addTaskNote(uuid.parse((await ctx.params).id), noteSchema.parse(await readJson(request)), user);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
