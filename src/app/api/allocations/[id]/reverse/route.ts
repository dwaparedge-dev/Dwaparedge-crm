import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { reasonSchema } from "@/features/payments/schema";
import { reverseAllocation } from "@/features/payments/service";

export async function POST(request: Request, ctx: RouteContext<"/api/allocations/[id]/reverse">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { reason } = reasonSchema.parse(await readJson(request));
    await reverseAllocation(uuid.parse((await ctx.params).id), reason, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
