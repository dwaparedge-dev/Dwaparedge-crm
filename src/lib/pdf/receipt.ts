import "server-only";
import { amountInWordsINR } from "@/lib/words";
import { PAYMENT_METHOD_LABELS } from "@/features/payments/schema";
import type { CompanySettings } from "@/features/settings/service";
import type { AllocationRow, PaymentRow } from "@/features/payments/service";
import { COLORS, dmy, joinLines, money, newDoc, toBuffer, watermark } from "./common";

const L = 36;
const W = 523;

export async function buildReceiptPdf(args: { payment: PaymentRow; allocations: AllocationRow[]; company: CompanySettings; clientName: string }): Promise<Buffer> {
  const { payment: p, company: c } = args;
  const doc = newDoc(`Receipt ${p.receipt_number}`);
  doc.fillColor(COLORS.ink).font("Helvetica-Bold").fontSize(16).text(c.trade_name || c.legal_name, L, 36, { width: 330 });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(
    joinLines(c.address, [c.city, c.postal_code].filter(Boolean).join(", "), c.gstin && `GSTIN: ${c.gstin}`, [c.phone && `Ph: ${c.phone}`, c.email].filter(Boolean).join("   ")),
    L, doc.y + 2, { width: 330 },
  );
  doc.font("Helvetica-Bold").fontSize(18).fillColor(COLORS.accent).text("PAYMENT RECEIPT", 330, 36, { width: W - 294, align: "right" });

  let y = 120;
  doc.roundedRect(L, y, W, 96, 4).strokeColor(COLORS.line).lineWidth(0.8).stroke();
  const rows: Array<[string, string]> = [
    ["Receipt No.", p.receipt_number], ["Date", dmy(p.payment_date)], ["Received from", args.clientName],
    ["Payment method", PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method], ["Reference", p.reference ?? "-"],
  ];
  let ry = y + 9;
  for (const [k, v] of rows) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text(k, L + 10, ry, { width: 110 });
    doc.font("Helvetica-Bold").fillColor(COLORS.ink).text(v, L + 125, ry, { width: W - 140 });
    ry += 16;
  }
  y += 112;
  doc.rect(L, y, W, 38).fill(COLORS.soft);
  doc.font("Helvetica-Bold").fontSize(11).fillColor(COLORS.ink).text(`Amount received:  INR ${money(p.amount)}`, L + 10, y + 7, { width: W - 20 });
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.muted).text(amountInWordsINR(p.amount), L + 10, y + 23, { width: W - 20 });
  y += 56;

  const live = args.allocations.filter((a) => !a.reversed_at);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(COLORS.ink).text("Applied to", L, y);
  y += 16;
  if (live.length) {
    for (const a of live) {
      doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink).text(`Invoice ${a.invoice_number}`, L + 4, y, { width: 300 });
      doc.text(money(a.amount), L + 300, y, { width: W - 304, align: "right" });
      y += 15;
    }
  }
  const unallocated = Number(p.unallocated);
  if (unallocated > 0) {
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink).text("Advance / not yet allocated to an invoice", L + 4, y, { width: 300 });
    doc.text(money(p.unallocated), L + 300, y, { width: W - 304, align: "right" });
    y += 15;
  }
  if (!live.length && unallocated <= 0) doc.font("Helvetica").fontSize(9).fillColor(COLORS.muted).text("-", L + 4, y);
  if (p.notes) {
    doc.font("Helvetica-Bold").fontSize(8).fillColor(COLORS.muted).text("NOTES", L, y + 16);
    doc.font("Helvetica").fontSize(9).fillColor(COLORS.ink).text(p.notes, L, y + 28, { width: W });
  }
  doc.font("Helvetica").fontSize(8.5).fillColor(COLORS.ink).text(`For ${c.trade_name || c.legal_name}`, L + W - 200, 640, { width: 200, align: "right" });
  doc.moveTo(L + W - 160, 688).lineTo(L + W, 688).strokeColor(COLORS.muted).lineWidth(0.6).stroke();
  doc.fontSize(8).fillColor(COLORS.muted).text(c.signatory_name ? `${c.signatory_name} - Authorised Signatory` : "Authorised Signatory", L + W - 200, 692, { width: 200, align: "right" });

  doc.page.margins.bottom = 0; // footer sits inside the bottom margin; without this PDFKit adds a blank page
  if (p.voided_at) watermark(doc, "VOID");
  doc.font("Helvetica").fontSize(7.5).fillColor(COLORS.muted).text("This is a computer-generated receipt. A receipt acknowledges money received; it is not a tax invoice.", L, 806, { width: W, align: "center", lineBreak: false });
  return toBuffer(doc);
}
