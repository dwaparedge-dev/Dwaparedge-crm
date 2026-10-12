/**
 * Document numbers. Pure string work (no database), so it is unit-tested and usable anywhere.
 *
 *   client code     AA01 ... AA99, AB01 ... AZ99, BA01 ...   (2 letters + 2 digits, permanent per client)
 *   sale order      SL-AA01-01        SL-<client>-<nth sale of the client>
 *   quotation       QT-1026-AA01-01   QT-<MMYY>-<client>-<nth that month>
 *   invoice         INV-1026-AA01-01  INV-<MMYY>-<client>-<nth that month>
 *
 * The three prefixes are fixed, not settings. GST (CGST Rule 46) allows an invoice number of at most 16 characters,
 * from letters, digits, "-" and "/"; INV-1026-AA01-01 is exactly 16.
 */

const PER_LETTER_PAIR = 99; // AA01..AA99, then AB01
export const MAX_CLIENT_CODES = 26 * 26 * PER_LETTER_PAIR;
export const GST_INVOICE_NUMBER_MAX = 16;
export const INVOICE_PREFIX = "INV";
export const QUOTATION_PREFIX = "QT";
export const SALE_PREFIX = "SL";

/** 1 -> AA01, 99 -> AA99, 100 -> AB01, 2574 -> AZ99, 2575 -> BA01. */
export function clientCodeFromIndex(n: number): string {
  if (!Number.isInteger(n) || n < 1) throw new Error("The client number must be a positive whole number");
  if (n > MAX_CLIENT_CODES) throw new Error(`Client codes are used up (the limit is ${MAX_CLIENT_CODES})`);
  const pair = Math.floor((n - 1) / PER_LETTER_PAIR);
  const first = String.fromCharCode(65 + Math.floor(pair / 26));
  const second = String.fromCharCode(65 + (pair % 26));
  return `${first}${second}${String(((n - 1) % PER_LETTER_PAIR) + 1).padStart(2, "0")}`;
}

/** "2026-10-12" -> "1026". */
export function mmyy(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-\d{2}/.exec(isoDate);
  if (!m) throw new Error("Invalid date for a document number");
  return `${m[2]}${m[1]!.slice(2)}`;
}

const two = (n: number) => String(n).padStart(2, "0");

export const saleNumber = (clientCode: string, seq: number) => `${SALE_PREFIX}-${clientCode}-${two(seq)}`;

export const quotationNumber = (isoDate: string, clientCode: string, seq: number) => `${QUOTATION_PREFIX}-${mmyy(isoDate)}-${clientCode}-${two(seq)}`;

/** Throws rather than issuing a number GST would not accept (a 3-digit sequence pushes it past 16 characters). */
export function invoiceNumber(isoDate: string, clientCode: string, seq: number): string {
  const n = `${INVOICE_PREFIX}-${mmyy(isoDate)}-${clientCode}-${two(seq)}`;
  if (n.length > GST_INVOICE_NUMBER_MAX) {
    throw new Error(`Invoice number ${n} would be longer than ${GST_INVOICE_NUMBER_MAX} characters (GST limit). A client can have at most 99 invoices a month.`);
  }
  return n;
}

/** Counter scope for the "nth that month" part of quotation and invoice numbers. */
export const monthScope = (isoDate: string, clientCode: string) => `${clientCode}-${mmyy(isoDate)}`;
