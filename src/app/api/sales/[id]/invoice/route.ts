import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { createDraftFromSale } from "@/features/invoices/service";

export async function POST(request: Request, ctx: RouteContext<"/api/sales/[id]/invoice">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = await createDraftFromSale(uuid.parse((await ctx.params).id), user.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
