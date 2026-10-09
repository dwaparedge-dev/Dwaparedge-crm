import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { applyAdvanceSchema } from "@/features/payments/schema";
import { applyAdvance } from "@/features/payments/service";

export async function POST(request: Request, ctx: RouteContext<"/api/sales/[id]/apply-advance">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { invoiceId } = applyAdvanceSchema.parse(await readJson(request));
    const applied = await applyAdvance(uuid.parse((await ctx.params).id), user.id, invoiceId);
    return NextResponse.json({ applied });
  } catch (error) {
    return errorResponse(error);
  }
}
