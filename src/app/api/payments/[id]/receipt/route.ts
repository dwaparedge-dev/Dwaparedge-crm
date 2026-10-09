import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { getPayment } from "@/features/payments/service";
import { getSettings } from "@/features/settings/service";
import { optionLabels } from "@/features/options/service";
import { buildReceiptPdf } from "@/lib/pdf/receipt";


export async function GET(request: NextRequest, ctx: RouteContext<"/api/payments/[id]/receipt">) {
  try {
    await requireUser();
    const download = request.nextUrl.searchParams.get("download") === "1";
    const { allocations, ...payment } = await getPayment(uuid.parse((await ctx.params).id));
    const pdf = await buildReceiptPdf({ payment, allocations, company: await getSettings(), clientName: payment.client_name, methodLabel: (await optionLabels("payments", "method"))[payment.method.toLowerCase()] ?? payment.method });
    const name = payment.receipt_number.replace(/[^A-Za-z0-9._-]+/g, "_");
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${name}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
