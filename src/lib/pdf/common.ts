import { readFileSync } from "node:fs";
import { join } from "node:path";
import PDFDocument from "pdfkit";

export const COLORS = {
  ink: "#172033", muted: "#64748b", line: "#dbe3ee", accent: "#2563eb", soft: "#f8fafc",
  tint: "#eaf1ff", body: "#475569", faint: "#e8edf4", chip: "#eceff3",
};
/** Page geometry shared by the invoice pages (A4 with 36pt margins). */
export const PAGE = { left: 36, width: 523, bottom: 785 } as const;

/** Embedded Noto Sans: the standard PDF fonts have no rupee sign. Registered lazily, so documents that don't use them never read the files. */
export const FONT = { regular: "Body", bold: "Body-Bold" } as const;
const FONT_DIR = join(process.cwd(), "src", "assets", "fonts");

/** The authorised signatory's signature (transparent PNG), or null when the file is not there. Read once. */
let signature: Buffer | null | undefined;
export function signatureImage(): Buffer | null {
  if (signature === undefined) {
    try {
      signature = readFileSync(join(process.cwd(), "src", "assets", "signature.png"));
    } catch {
      signature = null;
    }
  }
  return signature;
}

const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Display only (PDF text). Authoritative amounts stay as decimal strings from the database. */
export const money = (v: string | number) => inr.format(Number(v));
/** Only for text set in FONT.* - the standard fonts cannot draw the sign. */
export const rupee = (v: string | number) => `₹${money(v)}`;
export const dmy = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};

/** DD/MM/YYYY, the invoice's date style. */
export const dmySlash = (iso: string | null | undefined) => dmy(iso).replaceAll("-", "/");

export function newDoc(title: string, created?: Date) {
  const doc = new PDFDocument({ size: "A4", margin: 36, info: { Title: title, Producer: "DwaparEdge CRM", ...(created ? { CreationDate: created, ModDate: created } : {}) }, bufferPages: true });
  doc.registerFont(FONT.regular, join(FONT_DIR, "NotoSans-Regular.ttf"));
  doc.registerFont(FONT.bold, join(FONT_DIR, "NotoSans-Bold.ttf"));
  return doc;
}

export function toBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    doc.end();
  });
}

export function watermark(doc: PDFKit.PDFDocument, text: string) {
  doc.save();
  doc.rotate(-35, { origin: [297, 420] });
  doc.fillColor("#c4c9d4").fillOpacity(0.35).font("Helvetica-Bold").fontSize(90).text(text, 60, 380, { width: 480, align: "center", lineBreak: false });
  doc.restore();
  doc.fillOpacity(1);
}

export function joinLines(...parts: Array<string | null | undefined>) {
  return parts.map((p) => p?.trim()).filter(Boolean).join("\n");
}

/** Horizontal rule across the content width. */
export function rule(doc: PDFKit.PDFDocument, y: number, opts: { color?: string; weight?: number } = {}) {
  doc.moveTo(PAGE.left, y).lineTo(PAGE.left + PAGE.width, y).lineWidth(opts.weight ?? 0.7).strokeColor(opts.color ?? COLORS.line).stroke();
}

/** Small spaced-out grey caption such as "BILL TO". */
export function sectionLabel(doc: PDFKit.PDFDocument, text: string, x: number, y: number, width: number) {
  doc.font(FONT.regular).fontSize(7.5).fillColor(COLORS.muted).text(text, x, y, { width, characterSpacing: 0.8 });
}

/** "Label: value" with a grey label and bold value. Returns the y below it. */
export function labelled(doc: PDFKit.PDFDocument, label: string, value: string, x: number, y: number, width: number): number {
  doc.font(FONT.regular).fontSize(8.5).fillColor(COLORS.muted).text(`${label}: `, x, y, { width, continued: true });
  doc.font(FONT.bold).fillColor(COLORS.ink).text(value);
  return doc.y + 2;
}

/** Starts a new page when `height` more points would run past the content area. Returns the y to continue at. */
export function ensureRoom(doc: PDFKit.PDFDocument, y: number, height: number): number {
  if (y + height <= PAGE.bottom) return y;
  doc.addPage();
  return PAGE.left;
}
