import { NextResponse, type NextRequest } from "next/server";
import { errorResponse } from "@/lib/http";
import { requireUser } from "@/lib/auth/current-user";
import { db } from "@/lib/db";
import { stateNameByCode } from "@/lib/india";
import { uuid } from "@/lib/validation";
import { getInvoice, type ClientSnapshot, type CompanySnapshot } from "@/features/invoices/service";
import { getSettings } from "@/features/settings/service";
import { buildInvoicePdf } from "@/lib/pdf/invoice";


export async function GET(request: NextRequest, ctx: RouteContext<"/api/invoices/[id]/pdf">) {
  try {
    await requireUser();
    const download = request.nextUrl.searchParams.get("download") === "1";
    const { items, allocations, ...invoice } = await getInvoice(uuid.parse((await ctx.params).id));
    void allocations;

    // Issued/cancelled invoices render from their frozen snapshot; drafts from live data.
    let company = invoice.company_snapshot as CompanySnapshot | null;
    let client = invoice.client_snapshot as ClientSnapshot | null;
    if (!company || !client) {
      const s = await getSettings();
      company = { ...s, state: stateNameByCode(s.state_code) };
      const c = (await db.queryOne<Record<string, string | null>>("SELECT * FROM clients WHERE id = $1", [invoice.client_id]))!;
      client = {
        name: c.display_name!, legalName: c.legal_name!, gstin: c.gstin ?? null, pan: c.pan ?? null, billingAddress: c.billing_address ?? null, shippingAddress: c.shipping_address ?? null,
        city: c.city ?? null, state: stateNameByCode(c.state_code), stateCode: c.state_code ?? null, postalCode: c.postal_code ?? null, country: c.country!, email: c.email ?? null, phone: c.phone ?? null,
      };
    }
    const pdf = await buildInvoicePdf({ invoice, items, company, client });
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
