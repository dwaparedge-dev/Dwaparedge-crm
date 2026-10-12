import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBillingStatement, type DocumentSnapshot } from "@/lib/billing";
import { buildInvoicePdf, type InvoicePdfData } from "@/lib/pdf/invoice";
import type { InvoiceItemRow, InvoiceRow } from "@/features/invoices/service";

const pages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Type \/Page\b(?!s)/g) ?? []).length;

const company: InvoicePdfData["company"] = {
  legal_name: "DwaparEdge Technologies Private Limited", trade_name: "DwaparEdge", address: "402, Orbit Business Hub, Ring Road", city: "Surat", state: "Gujarat",
  state_code: "24", postal_code: "395002", gstin: "24AABCD1234E1Z5", pan: "AABCD1234E", email: "billing@dwaparedge.in", phone: "+91 98765 43210", website: "www.dwaparedge.in",
  bank_account_name: "DwaparEdge Technologies Pvt Ltd", bank_name: "HDFC Bank", bank_account_number: "50200012345678", bank_ifsc: "HDFC0001234", bank_branch: "Ring Road, Surat",
  upi_id: "dwaparedge@hdfcbank", signatory_name: "Dharmik Patel", invoice_tagline: "AI-powered manufacturing intelligence", invoice_declaration: null,
};
const client: InvoicePdfData["client"] = {
  name: "Aries", legalName: "Aries Engineering Works Pvt Ltd", gstin: "24AAACA1234B1Z9", pan: null, billingAddress: "Plot 14, GIDC Estate, Vatva", shippingAddress: null,
  city: "Ahmedabad", state: "Gujarat", stateCode: "24", postalCode: "382445", country: "India", email: null, phone: null,
};

function item(position: number, taxable: string, rate: number, supply: "intra" | "inter", description = "FactoONE Manufacturing ERP Implementation (Project initiation & discovery)"): InvoiceItemRow {
  const tax = (Number(taxable) * rate) / 100;
  const half = (tax / 2).toFixed(2);
  return {
    id: `i${position}`, position, sale_item_id: "s", product_id: null, description, hsn_sac: "998314", quantity: "1", unit_price: taxable, discount_percent: "0", tax_rate: String(rate),
    taxable_amount: taxable, cgst_amount: supply === "intra" ? half : "0.00", sgst_amount: supply === "intra" ? half : "0.00", igst_amount: supply === "inter" ? tax.toFixed(2) : "0.00",
    tax_amount: tax.toFixed(2), line_total: (Number(taxable) + tax).toFixed(2),
  };
}

function invoice(items: InvoiceItemRow[], over: Partial<InvoiceRow> = {}): InvoiceRow {
  const subtotal = items.reduce((a, i) => a + Number(i.taxable_amount), 0);
  const tax = items.reduce((a, i) => a + Number(i.tax_amount), 0);
  const supply = Number(items[0]!.igst_amount) > 0 ? "inter" : "intra";
  return {
    id: "inv", invoice_number: "INV-1026-AA01-01", status: "issued", client_id: "c", client_name: "Aries", sale_id: "s", sale_number: "SL-AA01-01", issue_date: "2026-10-12",
    due_date: "2026-10-27", currency: "INR", place_of_supply_state_code: supply === "intra" ? "24" : "27", supply_type: supply, subtotal: subtotal.toFixed(2),
    cgst_total: supply === "intra" ? (tax / 2).toFixed(2) : "0.00", sgst_total: supply === "intra" ? (tax / 2).toFixed(2) : "0.00", igst_total: supply === "inter" ? tax.toFixed(2) : "0.00",
    tax_total: tax.toFixed(2), round_off: "0.00", total: (subtotal + tax).toFixed(2), payment_terms: "Payable within 15 days of the invoice date.", notes: null,
    client_snapshot: client, company_snapshot: company, document_snapshot: null, issued_at: "2026-10-12T05:00:00Z", cancelled_at: null, cancel_reason: null,
    created_at: "2026-10-12T05:00:00Z", updated_at: "2026-10-12T05:00:00Z", amount_paid: "0.00", balance_due: (subtotal + tax).toFixed(2), payment_status: "unpaid", is_overdue: false,
    ...over,
  };
}

const plan = [
  { id: "m1", position: 1, title: "Project initiation & discovery", basis: "percent" as const, percent: "15.00", taxable: "97500.00" },
  { id: "m2", position: 2, title: "Solution design & configuration", basis: "percent" as const, percent: "20.00", taxable: "130000.00" },
  { id: "m3", position: 3, title: "Core modules & workflows", basis: "percent" as const, percent: "20.00", taxable: "130000.00" },
  { id: "m4", position: 4, title: "Integration & testing", basis: "percent" as const, percent: "20.00", taxable: "130000.00" },
  { id: "m5", position: 5, title: "UAT & user training", basis: "percent" as const, percent: "15.00", taxable: "97500.00" },
  { id: "m6", position: 6, title: "Go-live & handover", basis: "percent" as const, percent: "10.00", taxable: "65000.00" },
];
const documentFor = (current: string | null, thisInvoice: string, before = "0.00"): DocumentSnapshot => {
  const cur = plan.find((m) => m.id === current);
  const statement = buildBillingStatement({ contractValue: "650000.00", billedBefore: before, thisInvoice, milestones: plan, currentMilestoneId: current });
  return {
    version: 1,
    sale: { number: "SL-AA01-01", title: "FactoONE Manufacturing ERP Implementation", quotationNumber: "QT-1026-AA01-01", agreementRef: "SOW-ARIES-001" },
    milestone: cur ? {
      position: cur.position, title: cur.title, share: statement.schedule.find((s) => s.current)!.share,
      description: "Project kickoff and stakeholder alignment; requirements gathering across agreed manufacturing and business workflows; initial process mapping; project implementation plan and scope confirmation, as defined in the approved quotation and Scope of Work.",
    } : null,
    statement,
  };
};

const scenarios: Record<string, { data: InvoicePdfData; pages: number }> = {
  "milestone-intra": {
    data: { invoice: invoice([item(1, "97500.00", 18, "intra")], { document_snapshot: documentFor("m1", "97500.00") }), items: [item(1, "97500.00", 18, "intra")], company, client, document: documentFor("m1", "97500.00") },
    pages: 1,
  },
  "milestone-inter-partly-paid": {
    data: {
      invoice: invoice([item(1, "130000.00", 18, "inter", "FactoONE Manufacturing ERP Implementation (Solution design & configuration)")], { amount_paid: "50000.00", balance_due: "103400.00" }), items: [item(1, "130000.00", 18, "inter", "FactoONE Manufacturing ERP Implementation (Solution design & configuration)")], company, client: { ...client, state: "Maharashtra", stateCode: "27" },
      document: documentFor("m2", "130000.00", "97500.00"),
    },
    pages: 1,
  },
  "legacy-no-snapshot": { data: { invoice: invoice([item(1, "50000.00", 18, "intra", "Annual licence")]), items: [item(1, "50000.00", 18, "intra", "Annual licence")], company, client, document: null }, pages: 1 },
  "draft-no-gstin": {
    data: { invoice: invoice([item(1, "1000.00", 0, "intra", "Support hours")], { status: "draft", invoice_number: null }), items: [item(1, "1000.00", 0, "intra", "Support hours")], company: { ...company, gstin: null, invoice_tagline: null }, client, document: null },
    pages: 1,
  },
  "many-lines-mixed-rates": (() => {
    const items = Array.from({ length: 28 }, (_, i) => item(i + 1, "12345.67", i % 3 === 0 ? 5 : 18, "intra", `Line ${i + 1} — a fairly long description of the goods and services supplied under this order so that it wraps across more than one line`));
    return { data: { invoice: invoice(items, { notes: "Thank you for your business. ".repeat(12) }), items, company, client, document: documentFor("m3", "345679.00") }, pages: 0 };
  })(),
};

describe("invoice PDF", () => {
  for (const [name, s] of Object.entries(scenarios)) {
    it(`renders ${name}`, async () => {
      const pdf = await buildInvoicePdf(s.data);
      const out = process.env.INVOICE_PDF_OUT; // set it to look at the rendered pages
      if (out) {
        mkdirSync(out, { recursive: true });
        writeFileSync(join(out, `${name}.pdf`), pdf);
      }
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
      if (s.pages) expect(pages(pdf)).toBe(s.pages);
      else expect(pages(pdf)).toBeGreaterThan(1); // a long invoice flows over extra pages
    });
  }

  it("embeds a font that has the rupee sign", async () => {
    const pdf = (await buildInvoicePdf(scenarios["milestone-intra"]!.data)).toString("latin1");
    expect(pdf).toMatch(/NotoSans/);
  });

  describe("an issued invoice is generated exactly as it was", () => {
    const base = scenarios["milestone-intra"]!.data;
    const original = buildInvoicePdf(base);

    it("whatever happens to the client, the sale or payments afterwards", async () => {
      // Everything below is live data that can change after issue. The frozen snapshots and stored invoice fields stay the same.
      const later: InvoicePdfData = {
        ...base,
        invoice: { ...base.invoice, client_name: "Renamed Client Ltd", sale_number: "SL-ZZ99-99", amount_paid: "115050.00", balance_due: "0.00", payment_status: "paid", is_overdue: false, updated_at: "2027-01-01T00:00:00Z" },
      };
      expect((await buildInvoicePdf(later)).equals(await original)).toBe(true);
    });

    it("on every download", async () => {
      expect((await buildInvoicePdf(base)).equals(await original)).toBe(true);
    });

    it("but does show the changes in its own frozen data (so the test above is not vacuous)", async () => {
      const edited: InvoicePdfData = { ...base, client: { ...base.client, legalName: "Someone Else Ltd" } };
      expect((await buildInvoicePdf(edited)).equals(await original)).toBe(false);
    });
  });
});
