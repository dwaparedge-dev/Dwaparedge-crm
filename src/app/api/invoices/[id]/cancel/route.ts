import { NextResponse } from "next/server";
import { assertSameOrigin, errorResponse, readJson } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { cancelSchema } from "@/features/invoices/schema";
import { cancelInvoice } from "@/features/invoices/service";

export async function POST(request: Request, ctx: RouteContext<"/api/invoices/[id]/cancel">) {
  try {
    assertSameOrigin(request);
    const user = await requireUser();
    const { reason } = cancelSchema.parse(await readJson(request));
    await cancelInvoice(uuid.parse((await ctx.params).id), reason, user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error);
  }
}
