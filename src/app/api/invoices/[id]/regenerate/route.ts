import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { regenerateSchema } from "@/features/invoices/schema";
import { regenerateInvoice } from "@/features/invoices/service";

export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/regenerate">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { reason, dueDate, updateInvoiceDate } = regenerateSchema.parse(await readJson(request));
    const version = await regenerateInvoice(uuid.parse((await ctx.params).id), reason, user.id, dueDate, updateInvoiceDate);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
