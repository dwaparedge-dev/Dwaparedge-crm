import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { regenerateSchema } from "@/features/invoices/schema";
import { previewRenumber, regenerateInvoice } from "@/features/invoices/service";

/** What regenerating would do to the number (nothing is changed or used up): `?updateInvoiceDate=true` assumes the date moves to today. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/regenerate">) {
  try {
    await requireUser();
    const id = uuid.parse((await ctx.params).id);
    return NextResponse.json(await previewRenumber(id, request.nextUrl.searchParams.get("updateInvoiceDate") === "true"));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/regenerate">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { reason, dueDate, updateInvoiceDate, renumberInvoice } = regenerateSchema.parse(await readJson(request));
    const version = await regenerateInvoice(uuid.parse((await ctx.params).id), reason, user.id, dueDate, updateInvoiceDate, renumberInvoice);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
