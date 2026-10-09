import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { issueInvoice } from "@/features/invoices/service";

export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/issue">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const number = await issueInvoice(uuid.parse((await ctx.params).id), user.id);
    return NextResponse.json({ ok: true, invoiceNumber: number });
  } catch (error) {
    return errorResponse(error);
  }
}
