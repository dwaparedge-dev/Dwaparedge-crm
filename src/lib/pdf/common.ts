import PDFDocument from "pdfkit";

export const COLORS = { ink: "#1a1f2b", muted: "#5b6472", line: "#d5dae3", accent: "#1e4fd8", soft: "#f3f6fb" };
const inr = new Intl.NumberFormat("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Display only (PDF text). Authoritative amounts stay as decimal strings from the database. */
export const money = (v: string | number) => inr.format(Number(v));
export const dmy = (iso: string | null | undefined) => {
  if (!iso) return "";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
};

export function newDoc(title: string) {
  return new PDFDocument({ size: "A4", margin: 36, info: { Title: title, Producer: "DwaparEdge CRM" }, bufferPages: true });
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
