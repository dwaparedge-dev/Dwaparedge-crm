/**
 * Exact money arithmetic. Amounts are integers in paise, quantities in thousandths and
 * percentages in basis points (percent x 100), all as BigInt, so there is no floating point
 * anywhere in a financial total. Rounding is half-up (half away from zero for negatives).
 * No server-only imports: the browser uses this for live previews, the server for the real numbers.
 */

const DECIMAL = /^-?\d+(\.\d+)?$/;

export function parseScaled(input: string | number, scale: number, label = "value"): bigint {
  const s = typeof input === "number" ? String(input) : input.trim();
  if (!DECIMAL.test(s)) throw new Error(`${label} is not a valid number`);
  const neg = s.startsWith("-");
  const [int, frac = ""] = s.replace("-", "").split(".");
  if (frac.length > scale && /[1-9]/.test(frac.slice(scale))) {
    throw new Error(`${label} allows at most ${scale} decimal places`);
  }
  const n = BigInt(int! + frac.padEnd(scale, "0").slice(0, scale));
  return neg ? -n : n;
}

export function formatScaled(v: bigint, scale: number): string {
  const neg = v < 0n;
  const digits = (neg ? -v : v).toString().padStart(scale + 1, "0");
  const int = digits.slice(0, digits.length - scale);
  const frac = digits.slice(digits.length - scale);
  return `${neg ? "-" : ""}${int}${scale ? "." + frac : ""}`;
}

/** n / d rounded half away from zero. */
export function divRound(n: bigint, d: bigint): bigint {
  const neg = n < 0n !== d < 0n;
  const an = n < 0n ? -n : n;
  const ad = d < 0n ? -d : d;
  const q = (an * 2n + ad) / (ad * 2n);
  return neg ? -q : q;
}

export interface LineInput {
  unitPrice: string | number;
  quantity: string | number;
  discountPercent?: string | number;
  taxRate?: string | number;
}
export interface LineAmounts {
  gross: string;
  discount: string;
  taxable: string;
  tax: string;
  total: string;
}

/** gross = qty x price; discount on gross; tax on the discounted (taxable) value. */
export function computeLine(l: LineInput): LineAmounts {
  const price = parseScaled(l.unitPrice, 2, "Unit price");
  const qty = parseScaled(l.quantity, 3, "Quantity");
  const disc = parseScaled(l.discountPercent ?? 0, 2, "Discount");
  const rate = parseScaled(l.taxRate ?? 0, 2, "Tax rate");
  const gross = divRound(price * qty, 1000n);
  const discount = divRound(gross * disc, 10000n);
  const taxable = gross - discount;
  const tax = divRound(taxable * rate, 10000n);
  const f = (v: bigint) => formatScaled(v, 2);
  return { gross: f(gross), discount: f(discount), taxable: f(taxable), tax: f(tax), total: f(taxable + tax) };
}

export function sumAmounts(values: string[]): string {
  return formatScaled(values.reduce((a, v) => a + parseScaled(v, 2), 0n), 2);
}
