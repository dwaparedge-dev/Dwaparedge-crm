import "server-only";
import { amountInWordsINR } from "@/lib/words";
import { COLORS, dmy, joinLines, money, newDoc, toBuffer, watermark } from "./common";
import type { ClientSnapshot, CompanySnapshot, InvoiceItemRow, InvoiceRow } from "@/features/invoices/service";

export interface InvoicePdfData {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  company: CompanySnapshot;
  client: ClientSnapshot;
}

type Doc = PDFKit.PDFDocument;
const L = 36;
const W = 523; // 595 - 2*36

const COLS = [
  { key: "n", label: "#", w: 20, align: "left" },
  { key: "desc", label: "Description", w: 150, align: "left" },
  { key: "hsn", label: "HSN/SAC", w: 46, align: "left" },
  { key: "qty", label: "Qty", w: 32, align: "right" },
  { key: "rate", label: "Rate", w: 54, align: "right" },
  { key: "disc", label: "Disc %", w: 34, align: "right" },
  { key: "taxable", label: "Taxable", w: 60, align: "right" },
  { key: "gst", label: "GST %", w: 33, align: "right" },
  { key: "tax", label: "GST Amt", w: 46, align: "right" },
  { key: "total", label: "Amount", w: 48, align: "right" },
] as const;

function header(doc: Doc, d: InvoicePdfData) {
  const c = d.company;
  const isTax = Boolean(c.gstin);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(16).text(c.trade_name || c.legal_name, L, 36, { width: 330 });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted);
  const addr = joinLines(
    c.trade_name && c.trade_name !== c.legal_name ? c.legal_name : null,
    c.address,
    [c.city, c.state, c.postal_code].filter(Boolean).join(", "),
    [c.gstin && `GSTIN: ${c.gstin}`, c.pan && `PAN: ${c.pan}`].filter(Boolean).join("   "),
    [c.phone && `Ph: ${c.phone}`, c.email].filter(Boolean).join("   "),
  );
  doc.text(addr, L, doc.y + 2, { width: 330 });
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.accent).text(isTax ? "TAX INVOICE" : "INVOICE", 380, 36, { width: W - 344, align: "right" });
  doc.font("Helvetica").fontSize(8).fillColor(COLORS.muted).text("(Amounts in INR)", 380, 58, { width: W - 344, align: "right" });
}

function metaAndParties(doc: Doc, d: InvoicePdfData, top: number): number {
  const inv = d.invoice;
  const half = W / 2 - 4;
  const rows: Array<[string, string]> = [
    ["Invoice No.", inv.invoice_number ?? "DRAFT (not numbered)"],
    ["Invoice Date", dmy(inv.issue_date)],
    ["Due Date", dmy(inv.due_date)],
    ["Order Ref.", inv.sale_number],
    ["Place of Supply", [stateOf(d), inv.place_of_supply_state_code && `(${inv.place_of_supply_state_code})`].filter(Boolean).join(" ")],
  ];
  doc.roundedRect(L, top, half, 99, 4).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  let y = top + 8;
  for (const [k, v] of rows) {
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(k, L + 8, y, { width: 80 });
    doc.font("Helvetica-Bold").fillColor(COLORS.ink).text(v, L + 92, y, { width: half - 100 });
    y += 15;
  }
  const cl = d.client;
  const bx = L + half + 8;
  doc.roundedRect(bx, top, half, 99, 4).strokeColor(COLORS.line).stroke();
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text("BILL TO", bx + 8, top + 7);
  doc.font("Helvetica-Bold").fontSize(10).fillColor(COLORS.ink).text(cl.legalName || cl.name, bx + 8, top + 19, { width: half - 16, height: 14, ellipsis: true });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(
    joinLines(cl.billingAddress, [cl.city, cl.state, cl.postalCode].filter(Boolean).join(", "), cl.gstin && `GSTIN: ${cl.gstin}`),
    bx + 8, top + 33, { width: half - 16, height: 62, ellipsis: true },
  );
  return top + 99;
}

const stateOf = (d: InvoicePdfData) => {
  const code = d.invoice.place_of_supply_state_code;
  return code && d.client.stateCode === code ? d.client.state ?? "" : "";
};

function tableHeader(doc: Doc, y: number): number {
  doc.rect(L, y, W, 18).fill(COLORS.accent);
  let x = L;
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor("#ffffff");
  for (const c of COLS) {
    doc.text(c.label, x + 3, y + 5.5, { width: c.w - 6, align: c.align });
    x += c.w;
  }
  return y + 18;
}

function items(doc: Doc, d: InvoicePdfData, startY: number): number {
  let y = tableHeader(doc, startY);
  d.items.forEach((it, idx) => {
    const desc = it.description;
    doc.font("Helvetica").fontSize(8);
    const h = Math.max(18, doc.heightOfString(desc, { width: COLS[1].w - 6 }) + 10);
    if (y + h > 740) {
      doc.addPage();
      y = tableHeader(doc, 36);
    }
    if (idx % 2 === 1) doc.rect(L, y, W, h).fill(COLORS.soft);
    const cells: Record<string, string> = {
      n: String(it.position), desc, hsn: it.hsn_sac ?? "", qty: String(Number(it.quantity)), rate: money(it.unit_price),
      disc: Number(it.discount_percent) ? String(Number(it.discount_percent)) : "-", taxable: money(it.taxable_amount),
      gst: String(Number(it.tax_rate)), tax: money(it.tax_amount), total: money(it.line_total),
    };
    let x = L;
    doc.fillColor(COLORS.ink).font("Helvetica").fontSize(8);
    for (const c of COLS) {
      doc.text(cells[c.key]!, x + 3, y + 5, { width: c.w - 6, align: c.align });
      x += c.w;
    }
    y += h;
    doc.moveTo(L, y).lineTo(L + W, y).strokeColor(COLORS.line).lineWidth(0.5).stroke();
  });
  return y;
}

function totals(doc: Doc, d: InvoicePdfData, top: number): number {
  const inv = d.invoice;
  if (top > 640) {
    doc.addPage();
    top = 36;
  }
  const rows: Array<[string, string, boolean?]> = [["Taxable value", money(inv.subtotal)]];
  if (inv.supply_type === "intra") {
    rows.push(["CGST", money(inv.cgst_total)], ["SGST", money(inv.sgst_total)]);
  } else {
    rows.push(["IGST", money(inv.igst_total)]);
  }
  if (Number(inv.round_off) !== 0) rows.push(["Round off", money(inv.round_off)]);
  rows.push(["Grand Total", money(inv.total), true]);
  if (inv.status === "issued" && Number(inv.amount_paid) > 0) {
    rows.push(["Amount paid", money(inv.amount_paid)], ["Balance due", money(inv.balance_due), true]);
  }
  const bx = L + W - 220;
  let y = top + 10;
  for (const [k, v, strong] of rows) {
    if (strong) doc.rect(bx - 6, y - 3, 226, 17).fill(COLORS.soft);
    doc.font(strong ? "Helvetica-Bold" : "Helvetica").fontSize(strong ? 9.5 : 8.5).fillColor(COLORS.ink);
    doc.text(k, bx, y, { width: 110 });
    doc.text(v, bx + 110, y, { width: 104, align: "right" });
    y += 17;
  }
  doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text("AMOUNT IN WORDS", L, top + 10);
  doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink).text(amountInWordsINR(inv.total), L, top + 22, { width: W - 240 });
  return Math.max(y, top + 60);
}

function footer(doc: Doc, d: InvoicePdfData, top: number) {
  const c = d.company;
  const inv = d.invoice;
  if (top > 600) {
    doc.addPage();
    top = 36;
  }
  let y = top + 14;
  const bank = joinLines(
    c.bank_account_name && `Account name: ${c.bank_account_name}`,
    c.bank_name && `Bank: ${c.bank_name}${c.bank_branch ? ", " + c.bank_branch : ""}`,
    c.bank_account_number && `A/c No.: ${c.bank_account_number}`,
    c.bank_ifsc && `IFSC: ${c.bank_ifsc}`,
    c.upi_id && `UPI: ${c.upi_id}`,
  );
  const colW = W / 2 - 8;
  if (bank) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text("BANK DETAILS", L, y);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.ink).text(bank, L, y + 12, { width: colW });
  }
  const termsY = y;
  if (inv.payment_terms || inv.notes) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text("TERMS & NOTES", L + colW + 16, termsY);
    doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.ink).text(joinLines(inv.payment_terms, inv.notes), L + colW + 16, termsY + 12, { width: colW });
  }
  y = Math.max(doc.y, y + 70) + 14;
  if (y > 740) {
    doc.addPage();
    y = 60;
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.ink).text(`For ${c.trade_name || c.legal_name}`, L + W - 200, y, { width: 200, align: "right" });
  doc.moveTo(L + W - 160, y + 48).lineTo(L + W, y + 48).strokeColor(COLORS.muted).lineWidth(0.6).stroke();
  doc.fontSize(8).fillColor(COLORS.muted).text(c.signatory_name ? `${c.signatory_name} - Authorised Signatory` : "Authorised Signatory", L + W - 200, y + 52, { width: 200, align: "right" });
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  const doc = newDoc(d.invoice.invoice_number ? `Invoice ${d.invoice.invoice_number}` : "Draft invoice");
  header(doc, d);
  const afterMeta = metaAndParties(doc, d, 98);
  const afterItems = items(doc, d, afterMeta + 14);
  const afterTotals = totals(doc, d, afterItems);
  footer(doc, d, afterTotals);

  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // footer sits inside the bottom margin; without this PDFKit adds a blank page
    if (d.invoice.status === "draft") watermark(doc, "DRAFT");
    if (d.invoice.status === "cancelled") watermark(doc, "CANCELLED");
    doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted).text(
      `This is a computer-generated document.   Page ${i + 1} of ${range.count}`, L, 806, { width: W, align: "center", lineBreak: false },
    );
  }
  return toBuffer(doc);
}
