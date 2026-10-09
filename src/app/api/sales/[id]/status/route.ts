import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { saleStatusSchema } from "@/features/sales/schema";
import { setSaleStatus } from "@/features/sales/service";

export async function POST(request: Request, ctx: RouteContext<"/api/sales/[id]/status">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { status } = saleStatusSchema.parse(await readJson(request));
    await setSaleStatus(uuid.parse((await ctx.params).id), status, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
