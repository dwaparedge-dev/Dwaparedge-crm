import "server-only";
import { amountInWordsINR } from "@/lib/words";
import { stateNameByCode } from "@/lib/india";
import { formatScaled, parseScaled } from "@/lib/money";
import type { DocumentSnapshot } from "@/lib/billing";
import { COLORS, FONT, PAGE, dmySlash, ensureRoom, joinLines, newDoc, rule, rupee, sectionLabel, toBuffer, watermark } from "./common";
import type { ClientSnapshot, CompanySnapshot, InvoiceItemRow, InvoiceRow } from "@/features/invoices/service";

export interface InvoicePdfData {
  invoice: InvoiceRow;
  items: InvoiceItemRow[];
  company: CompanySnapshot;
  client: ClientSnapshot;
  /** Project refs and billing schedule; null for invoices issued before these were recorded. */
  document: DocumentSnapshot | null;
}

type Doc = PDFKit.PDFDocument;
const L = PAGE.left;
const W = PAGE.width;
const MID = L + 266; // left edge of the right-hand column
const MID_W = L + W - MID;
const AMOUNT_W = 130;
const AS_PER_QUOTATION = "As per approved quotation and scope of work";

/** One line of body text at (x, y); returns the y for the next line. */
function line(doc: Doc, text: string, x: number, y: number, width: number, opts: { size?: number; color?: string; bold?: boolean; align?: "left" | "right" } = {}): number {
  doc.font(opts.bold ? FONT.bold : FONT.regular).fontSize(opts.size ?? 9).fillColor(opts.color ?? COLORS.ink).text(text, x, y, { width, align: opts.align ?? "left" });
  return doc.y + 2.5;
}

function header(doc: Doc, d: InvoicePdfData): number {
  const c = d.company;
  const isTax = Boolean(c.gstin);
  const leftW = 320;
  const brand = c.trade_name || c.legal_name;

  doc.font(FONT.bold).fontSize(16).fillColor(COLORS.accent).text(brand, L, 40, { width: leftW });
  let y = doc.y;
  if (c.invoice_tagline) {
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.muted).text(c.invoice_tagline.toUpperCase(), L, y + 2, { width: leftW, characterSpacing: 0.8 });
    y = doc.y;
  }
  y += 9;
  if (c.trade_name && c.trade_name !== c.legal_name) y = line(doc, c.legal_name, L, y, leftW, { size: 10.5 }) + 1;
  y = line(doc, joinLines(c.address, [c.city, c.state, c.postal_code].filter(Boolean).join(", ")), L, y, leftW, { size: 8.5, color: COLORS.muted });
  if (c.gstin) y = line(doc, `GSTIN: ${c.gstin}`, L, y, leftW, { size: 8.5, color: COLORS.muted });

  const rx = L + leftW + 14;
  const rw = W - leftW - 14;
  doc.font(FONT.bold).fontSize(13).fillColor(COLORS.ink).text(isTax ? "TAX INVOICE" : "INVOICE", rx, 40, { width: rw, align: "right" });
  let ry = doc.y + 7;
  const chip = "ORIGINAL FOR RECIPIENT";
  doc.font(FONT.regular).fontSize(6.5);
  const cw = doc.widthOfString(chip, { characterSpacing: 0.6 }) + 18;
  doc.roundedRect(rx + rw - cw, ry, cw, 15, 7.5).fill(COLORS.chip);
  doc.fillColor(COLORS.body).text(chip, rx + rw - cw, ry + 4.5, { width: cw, align: "center", characterSpacing: 0.6 });
  ry += 24;
  ry = line(doc, `Invoice No. ${d.invoice.invoice_number ?? "DRAFT (not numbered)"}`, rx, ry, rw, { size: 9.5, align: "right" }) + 1;
  line(doc, `Invoice Date: ${dmySlash(d.invoice.issue_date)}`, rx, ry, rw, { size: 9.5, align: "right" });
  return Math.max(y, doc.y);
}

function parties(doc: Doc, d: InvoicePdfData, top: number): number {
  const cl = d.client;
  const docu = d.document;
  const leftW = MID - L - 16;

  sectionLabel(doc, "BILL TO", L, top, leftW);
  let ly = line(doc, cl.legalName || cl.name, L, top + 13, leftW, { size: 11, bold: true });
  const address = joinLines(cl.billingAddress, [cl.city, cl.postalCode].filter(Boolean).join(", "));
  if (address) ly = line(doc, address, L, ly, leftW);
  ly = line(doc, `GSTIN: ${cl.gstin || "Not provided"}`, L, ly, leftW);
  if (cl.state) ly = line(doc, `State: ${cl.state}${cl.stateCode ? ` (${cl.stateCode})` : ""}`, L, ly, leftW);
  const pos = d.invoice.place_of_supply_state_code;
  if (pos && pos !== cl.stateCode) ly = line(doc, `Place of supply: ${stateNameByCode(pos) ?? ""} (${pos})`, L, ly, leftW);

  sectionLabel(doc, "PROJECT DETAILS", MID, top, MID_W);
  let ry = top + 13;
  if (docu) ry = line(doc, docu.sale.title, MID, ry, MID_W, { size: 11, bold: true });
  if (docu?.sale.quotationNumber) ry = line(doc, `Quotation: ${docu.sale.quotationNumber}`, MID, ry, MID_W);
  if (docu?.sale.agreementRef) ry = line(doc, `Contract/SOW: ${docu.sale.agreementRef}`, MID, ry, MID_W);
  if (docu?.milestone) ry = line(doc, `Milestone: M${String(docu.milestone.position).padStart(2, "0")} — ${docu.milestone.title}`, MID, ry, MID_W);
  else ry = line(doc, `Order: ${docu?.sale.number ?? d.invoice.sale_number}`, MID, ry, MID_W);

  return Math.max(ly, ry);
}

type Milestone = NonNullable<DocumentSnapshot["milestone"]>;
const milestoneTag = (m: Milestone) => `M${String(m.position).padStart(2, "0")}`;

/** The line's own wording; a milestone invoice's lines end in " (<milestone title>)", which the title below spells out properly. */
function lineTitle(it: InvoiceItemRow, m: Milestone | null | undefined): string {
  if (!m) return it.description;
  const base = it.description.endsWith(` (${m.title})`) ? it.description.slice(0, -(m.title.length + 3)) : it.description;
  return `${base} — ${milestoneTag(m)} · ${m.title}`;
}

interface Note { text: string; bold?: boolean }

/** Small notes under a line: the milestone's deliverables and share, the SAC/HSN code (bold), quantity and rate when they are not simply 1, and the GST rate when rates differ. */
function lineNotes(it: InvoiceItemRow, mixedRates: boolean, m: Milestone | null | undefined): Note[] {
  const notes: Note[] = [];
  if (m?.description) notes.push({ text: m.description.replace(/\s*\n\s*/g, " ").trim() });
  if (m) notes.push({ text: `${Number(m.share)}% of the project value · ${AS_PER_QUOTATION[0]!.toLowerCase()}${AS_PER_QUOTATION.slice(1)}` });
  if (it.hsn_sac) notes.push({ text: `${it.hsn_sac.startsWith("99") ? "SAC" : "HSN"}: ${it.hsn_sac}`, bold: true });
  const facts: string[] = [];
  if (Number(it.quantity) !== 1 || Number(it.discount_percent) > 0) {
    facts.push(`Qty ${Number(it.quantity)} × ${rupee(it.unit_price)}`);
    if (Number(it.discount_percent) > 0) facts.push(`Discount ${Number(it.discount_percent)}%`);
  }
  if (mixedRates) facts.push(`GST ${Number(it.tax_rate)}%`);
  if (facts.length) notes.push({ text: facts.join(" · ") });
  return notes;
}

function services(doc: Doc, d: InvoicePdfData, top: number): number {
  const mixed = new Set(d.items.map((i) => Number(i.tax_rate))).size > 1;
  const milestone = d.document?.milestone;
  const textW = W - AMOUNT_W - 12;

  let y = ensureRoom(doc, top, 110);
  sectionLabel(doc, "SERVICES BILLED", L, y, W);
  const tableHead = (at: number) => {
    doc.font(FONT.bold).fontSize(10.5).fillColor(COLORS.ink).text("Description", L, at, { width: textW });
    doc.text("Amount", L + W - AMOUNT_W, at, { width: AMOUNT_W, align: "right" });
    rule(doc, at + 19);
    return at + 29;
  };
  y = tableHead(y + 20);

  for (const it of d.items) {
    const notes = lineNotes(it, mixed, milestone);
    const title = lineTitle(it, milestone);
    doc.font(FONT.bold).fontSize(10);
    const titleH = doc.heightOfString(title, { width: textW });
    const notesH = notes.reduce((a, n) => a + doc.font(n.bold ? FONT.bold : FONT.regular).fontSize(7.5).heightOfString(n.text, { width: textW }) + 2, 0);
    const h = titleH + notesH + 8;
    if (y + h > PAGE.bottom) {
      doc.addPage();
      y = tableHead(PAGE.left);
    }
    doc.font(FONT.bold).fontSize(10).fillColor(COLORS.ink).text(title, L, y, { width: textW });
    doc.font(FONT.regular).text(rupee(it.taxable_amount), L + W - AMOUNT_W, y, { width: AMOUNT_W, align: "right" });
    let ny = y + titleH + 2;
    for (const n of notes) {
      doc.font(n.bold ? FONT.bold : FONT.regular).fontSize(7.5).fillColor(n.bold ? COLORS.body : COLORS.muted).text(n.text, L, ny, { width: textW });
      ny = doc.y + 2;
    }
    y += h;
  }
  return y;
}

/** Tax per GST rate, so an invoice mixing rates shows each one instead of a single blended figure. */
function taxRows(d: InvoicePdfData): Array<[string, string]> {
  const byRate = new Map<number, { cgst: bigint; sgst: bigint; igst: bigint }>();
  for (const it of d.items) {
    const rate = Number(it.tax_rate);
    const e = byRate.get(rate) ?? { cgst: 0n, sgst: 0n, igst: 0n };
    e.cgst += parseScaled(it.cgst_amount, 2);
    e.sgst += parseScaled(it.sgst_amount, 2);
    e.igst += parseScaled(it.igst_amount, 2);
    byRate.set(rate, e);
  }
  const rows: Array<[string, string]> = [];
  for (const [rate, e] of [...byRate].sort((a, b) => a[0] - b[0])) {
    if (rate === 0) continue; // nothing to show for nil-rated lines
    if (d.invoice.supply_type === "intra") {
      rows.push([`CGST @ ${rate / 2}%`, rupee(formatScaled(e.cgst, 2))], [`SGST @ ${rate / 2}%`, rupee(formatScaled(e.sgst, 2))]);
    } else {
      rows.push([`IGST @ ${rate}%`, rupee(formatScaled(e.igst, 2))]);
    }
  }
  return rows;
}

function summary(doc: Doc, d: InvoicePdfData, top: number): number {
  const inv = d.invoice;
  const rows: Array<[string, string]> = [["Taxable value", rupee(inv.subtotal)], ...taxRows(d)];
  if (Number(inv.round_off) !== 0) rows.push(["Round off", rupee(inv.round_off)]);

  let y = ensureRoom(doc, top + 6, rows.length * 24 + 80);
  for (const [k, v] of rows) {
    doc.font(FONT.regular).fontSize(10).fillColor(COLORS.body).text(k, L, y + 1, { width: W - AMOUNT_W });
    doc.font(FONT.bold).fontSize(11).fillColor(COLORS.ink).text(v, L + W - AMOUNT_W, y, { width: AMOUNT_W, align: "right" });
    y += 21;
  }
  rule(doc, y - 4);
  y += 8;
  doc.font(FONT.bold).fontSize(14).fillColor(COLORS.ink).text("Invoice total", L, y, { width: W - AMOUNT_W - 20 });
  doc.fillColor(COLORS.accent).text(rupee(inv.total), L + W - 200, y, { width: 200, align: "right" });
  y += 24;
  y = line(doc, `Amount in words: ${amountInWordsINR(inv.total)}`, L, y, W, { size: 8.5, color: COLORS.muted, align: "right" });
  return y;
}

function payment(doc: Doc, d: InvoicePdfData, top: number): number {
  const c = d.company;
  const inv = d.invoice;
  const bank = [
    c.bank_name && `Bank: ${c.bank_name}${c.bank_branch ? `, ${c.bank_branch}` : ""}`,
    c.bank_account_number && `Account: ${c.bank_account_number}${c.bank_account_name ? ` (${c.bank_account_name})` : ""}`,
    c.bank_ifsc && `IFSC: ${c.bank_ifsc}`,
    c.upi_id && `UPI: ${c.upi_id}`,
  ].filter(Boolean).join(" · ");
  const terms = joinLines(inv.payment_terms, inv.notes);
  doc.font(FONT.regular).fontSize(8.5);
  const bankH = bank ? doc.heightOfString(bank, { width: W }) + 8 : 0;
  const termsH = terms ? doc.heightOfString(terms, { width: W }) + 8 : 0;

  let y = ensureRoom(doc, top + 14, 70 + bankH + termsH);
  rule(doc, y - 6, { color: COLORS.faint });
  y += 8;
  sectionLabel(doc, "PAYMENT INFORMATION", L, y, W);
  y += 20;
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLORS.muted).text("Payment due date", L, y, { width: MID - L - 16 });
  doc.text("Payment reference", MID, y, { width: MID_W });
  doc.font(FONT.bold).fontSize(11).fillColor(COLORS.ink).text(dmySlash(inv.due_date), L, y + 13, { width: MID - L - 16 });
  doc.text(inv.invoice_number ?? "Assigned on issue", MID, y + 13, { width: MID_W });
  y += 36;
  if (bank) y = line(doc, bank, L, y, W, { size: 8.5, color: COLORS.muted }) + 1;
  if (terms) y = line(doc, terms, L, y, W, { size: 8.5, color: COLORS.muted }) + 1;
  return y;
}

const SIGN_SPACE = 44; // blank room to sign by hand
const SIGN_LINE_W = 190;

function signatory(doc: Doc, d: InvoicePdfData, top: number) {
  const c = d.company;
  const declaration = c.invoice_declaration?.trim();
  const contact = [c.legal_name, c.email, c.website].filter(Boolean).join(" · ");
  doc.font(FONT.regular).fontSize(8.5);
  const declH = declaration ? doc.heightOfString(declaration, { width: W }) + 12 : 0;

  // Kept together: the company line, the signing space, the line and the title never split across pages.
  let y = ensureRoom(doc, top + 8, 54 + SIGN_SPACE + declH); // rule, company line, signing space, signature line, title and contact line
  rule(doc, y - 6, { color: COLORS.faint });
  y += 10;
  if (declaration) y = line(doc, declaration, L, y, W, { size: 8.5, color: COLORS.muted }) + 8;
  y = line(doc, `For ${c.trade_name || c.legal_name}`, L, y, W, { size: 9, bold: true });
  y += SIGN_SPACE;
  doc.moveTo(L, y).lineTo(L + SIGN_LINE_W, y).lineWidth(0.7).strokeColor(COLORS.muted).stroke();
  doc.font(FONT.regular).fontSize(10.5).fillColor(COLORS.ink).text("Authorised signatory", L, y + 5, { width: W, continued: Boolean(c.signatory_name) });
  if (c.signatory_name) doc.fillColor(COLORS.muted).text(` · ${c.signatory_name}`);
  line(doc, contact, L, doc.y + 6, W, { size: 8.5, color: COLORS.muted });
}

export async function buildInvoicePdf(d: InvoicePdfData): Promise<Buffer> {
  // An issued invoice is stamped with its issue time, so downloading it again gives the same document.
  const doc = newDoc(d.invoice.invoice_number ? `Invoice ${d.invoice.invoice_number}` : "Draft invoice", d.invoice.issued_at ? new Date(d.invoice.issued_at) : undefined);
  let y = header(doc, d) + 14;
  rule(doc, y, { color: COLORS.accent, weight: 1.5 });
  y = parties(doc, d, y + 18) + 12;
  rule(doc, y, { color: COLORS.faint });
  y = services(doc, d, y + 16);
  y = summary(doc, d, y);
  y = payment(doc, d, y);
  signatory(doc, d, y);

  const range = doc.bufferedPageRange();
  const name = d.company.trade_name || d.company.legal_name;
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.page.margins.bottom = 0; // footer sits inside the bottom margin; without this PDFKit adds a blank page
    if (d.invoice.status === "draft") watermark(doc, "DRAFT");
    if (d.invoice.status === "cancelled") watermark(doc, "CANCELLED");
    doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.muted).text(
      `${name} · This is a computer-generated document.   Page ${i + 1} of ${range.count}`, L, 806, { width: W, align: "center", lineBreak: false },
    );
  }
  return toBuffer(doc);
}
