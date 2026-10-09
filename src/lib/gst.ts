import { computeLine, divRound, formatScaled, parseScaled, type LineInput } from "./money";

export type SupplyType = "intra" | "inter";

/**
 * Intra-state supply (same state as ours) -> CGST + SGST. Anything else -> IGST.
 * Both codes are required: guessing here would put the wrong tax on a legal document.
 */
export function supplyType(companyStateCode: string | null | undefined, placeOfSupplyStateCode: string | null | undefined): SupplyType {
  if (!companyStateCode) throw new Error("Set your company state in Settings before issuing invoices");
  if (!placeOfSupplyStateCode) throw new Error("Place of supply (state) is required");
  return companyStateCode === placeOfSupplyStateCode ? "intra" : "inter";
}

export interface InvoiceLineAmounts {
  gross: string;
  discount: string;
  taxable: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  total: string;
}

/**
 * Per-line GST. Intra-state: CGST and SGST are each computed at half the rate and rounded
 * separately (as GST returns expect), so tax = cgst + sgst always holds exactly.
 */
export function computeInvoiceLine(line: LineInput, supply: SupplyType): InvoiceLineAmounts {
  const base = computeLine({ ...line, taxRate: 0 });
  const taxable = parseScaled(base.taxable, 2);
  const rate = parseScaled(line.taxRate ?? 0, 2, "Tax rate");
  const half = supply === "intra" ? divRound(taxable * rate, 20000n) : 0n;
  const igst = supply === "inter" ? divRound(taxable * rate, 10000n) : 0n;
  const tax = half * 2n + igst;
  const f = (v: bigint) => formatScaled(v, 2);
  return {
    gross: base.gross, discount: base.discount, taxable: base.taxable,
    cgst: f(half), sgst: f(half), igst: f(igst), tax: f(tax), total: f(taxable + tax),
  };
}

export interface InvoiceTotals {
  subtotal: string;
  cgst: string;
  sgst: string;
  igst: string;
  tax: string;
  roundOff: string;
  total: string;
}

export function summarizeInvoice(lines: InvoiceLineAmounts[], roundToRupee: boolean): InvoiceTotals {
  const sum = (pick: (l: InvoiceLineAmounts) => string) => lines.reduce((a, l) => a + parseScaled(pick(l), 2), 0n);
  const subtotal = sum((l) => l.taxable);
  const cgst = sum((l) => l.cgst);
  const sgst = sum((l) => l.sgst);
  const igst = sum((l) => l.igst);
  const exact = subtotal + cgst + sgst + igst;
  const rounded = roundToRupee ? divRound(exact, 100n) * 100n : exact;
  const f = (v: bigint) => formatScaled(v, 2);
  return { subtotal: f(subtotal), cgst: f(cgst), sgst: f(sgst), igst: f(igst), tax: f(cgst + sgst + igst), roundOff: f(rounded - exact), total: f(rounded) };
}

/** Indian financial year label for a YYYY-MM-DD date: April-March, e.g. "2026-27". */
export function financialYear(isoDate: string): string {
  const [y, m] = isoDate.split("-").map(Number) as [number, number];
  const start = m >= 4 ? y : y - 1;
  return `${start}-${String((start + 1) % 100).padStart(2, "0")}`;
}
