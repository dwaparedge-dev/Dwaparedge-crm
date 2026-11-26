import { NextResponse, type NextRequest } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { reviseSchema, reviseTotalSchema } from "@/features/invoices/schema";
import { previewRevise, reviseInvoice } from "@/features/invoices/service";

/** What changing the total to `?total=` (incl. GST) would do; nothing is changed. A reason it cannot be done comes back as `blocked`. */
export async function GET(request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/revise">) {
  try {
    await requireUser();
    const total = reviseTotalSchema.parse(request.nextUrl.searchParams.get("total") ?? "");
    return NextResponse.json(await previewRevise(uuid.parse((await ctx.params).id), total));
  } catch (error) {
    return errorResponse(error);
  }
}

/** Changes the total of an issued invoice; its number stays. Returns the new version number. */
export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/revise">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { total, reason } = reviseSchema.parse(await readJson(request));
    const version = await reviseInvoice(uuid.parse((await ctx.params).id), total, reason, user.id);
    return NextResponse.json({ version }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
