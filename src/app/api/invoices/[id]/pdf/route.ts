import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { uuid } from "@/lib/validation";
import { z } from "zod";
import { getInvoice, getInvoiceRenderContext, getStoredInvoicePdf } from "@/features/invoices/service";
import { buildInvoicePdf } from "@/lib/pdf/invoice";


export async function GET(request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  try {
    await requireUser();
    const download = request.nextUrl.searchParams.get("download") === "1";
    const id = uuid.parse((await ctx.params).id);
    const versionParam = request.nextUrl.searchParams.get("version");
    const version = versionParam === null ? undefined : z.coerce.number().int().min(1).parse(versionParam);

    // Issued invoices keep the document as it was generated; only drafts and invoices without one are drawn live.
    const stored = await getStoredInvoicePdf(id, version);
    let pdf: Buffer;
    let number: string | null;
    if (stored) {
      pdf = stored.pdf;
      number = stored.invoice_number;
    } else {
      const { items, allocations, versions, ...invoice } = await getInvoice(id);
      void allocations;
      void versions;
      const { company, client, document } = await getInvoiceRenderContext(invoice);
      pdf = await buildInvoicePdf({ invoice, items, company, client, document });
      number = invoice.invoice_number;
    }
    const name = `${(number ?? "draft-invoice").replace(/[^A-Za-z0-9._-]+/g, "_")}${version ? `-v${version}` : ""}`;
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
