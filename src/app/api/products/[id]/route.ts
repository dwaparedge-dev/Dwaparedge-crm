import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { productInputSchema } from "@/features/products/schema";
import { getProduct, updateProduct } from "@/features/products/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    await requireUser();
    return NextResponse.json(await getProduct(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/products/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateProduct(uuid.parse((await ctx.params).id), productInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
