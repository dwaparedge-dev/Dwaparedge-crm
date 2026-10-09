import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { setArchived } from "@/features/clients/service";

export async function POST(request: Request, ctx: RouteContext<"/api/clients/[id]/archive">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = uuid.parse((await ctx.params).id);
    const { archived } = z.object({ archived: z.boolean() }).parse(await readJson(request));
    await setArchived(id, archived, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
