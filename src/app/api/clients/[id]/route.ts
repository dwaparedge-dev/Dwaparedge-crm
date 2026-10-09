import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { clientInputSchema } from "@/features/clients/schema";
import { getClient, updateClient } from "@/features/clients/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/clients/[id]">) {
  try {
    await requireUser();
    const id = uuid.parse((await ctx.params).id);
    return NextResponse.json(await getClient(id));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/clients/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = uuid.parse((await ctx.params).id);
    const { confirmDuplicate, ...body } = (await readJson(request)) as Record<string, unknown>;
    await updateClient(id, clientInputSchema.parse(body), user.id, confirmDuplicate === true);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
