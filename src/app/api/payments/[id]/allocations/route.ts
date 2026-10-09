import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { allocateSchema } from "@/features/payments/schema";
import { allocatePayment } from "@/features/payments/service";

export async function POST(request: Request, ctx: RouteContext<"/api/payments/[id]/allocations">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { allocations } = allocateSchema.parse(await readJson(request));
    await allocatePayment(uuid.parse((await ctx.params).id), allocations, user.id);
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
