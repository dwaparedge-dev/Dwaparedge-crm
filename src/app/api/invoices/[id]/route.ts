import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { invoiceInputSchema } from "@/features/invoices/schema";
import { deleteDraft, getInvoice, updateDraft } from "@/features/invoices/service";

export async function GET(_req: Request, ctx: RouteContext<"/api/invoices/[id]">) {
  try {
    await requireUser();
    return NextResponse.json(await getInvoice(uuid.parse((await ctx.params).id)));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, ctx: RouteContext<"/api/invoices/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await updateDraft(uuid.parse((await ctx.params).id), invoiceInputSchema.parse(await readJson(request)), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, ctx: RouteContext<"/api/invoices/[id]">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    await deleteDraft(uuid.parse((await ctx.params).id), user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
