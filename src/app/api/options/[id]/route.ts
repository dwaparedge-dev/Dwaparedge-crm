import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { updateOptionSchema } from "@/features/options/schema";
import { deleteOption, updateOption } from "@/features/options/service";

export async function PATCH(request: Request, ctx: RouteContext<"/api/options/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateOption(uuid.parse((await ctx.params).id), updateOptionSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/options/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await deleteOption(uuid.parse((await ctx.params).id), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
