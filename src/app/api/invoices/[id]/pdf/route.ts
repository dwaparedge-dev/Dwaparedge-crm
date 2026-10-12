import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { getInvoice, getInvoiceRenderContext } from "@/features/invoices/service";
import { buildInvoicePdf } from "@/lib/pdf/invoice";


export async function GET(request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  try {
    await requireUser();
    const download = request.nextUrl.searchParams.get("download") === "1";
    const { items, allocations, ...invoice } = await getInvoice(uuid.parse((await ctx.params).id));
    void allocations;

    const { company, client, document } = await getInvoiceRenderContext(invoice);
    const pdf = await buildInvoicePdf({ invoice, items, company, client, document });
    const name = (invoice.invoice_number ?? "draft-invoice").replace(/[^A-Za-z0-9._-]+/g, "_");
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
