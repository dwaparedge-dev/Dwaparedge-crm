import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { saleInputSchema } from "@/features/sales/schema";
import { getSale, updateSale } from "@/features/sales/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/sales/[id]">) {
  try {
    await requireUser();
    return NextResponse.json(await getSale(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/sales/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateSale(uuid.parse((await ctx.params).id), saleInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
