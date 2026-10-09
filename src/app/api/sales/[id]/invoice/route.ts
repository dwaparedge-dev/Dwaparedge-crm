import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { billSaleSchema } from "@/features/sales/schema";
import { createDraftForSale } from "@/features/invoices/service";

/** Starts a draft invoice for a sale: {mode: "rest"} | {mode: "percent", percent} | {mode: "amount", amount} | {mode: "milestone", milestoneId}. */
export async function POST(request: Request, ctx: RouteContext<"/api/sales/[id]/invoice">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const id = await createDraftForSale(uuid.parse((await ctx.params).id), billSaleSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ id }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
