import { computeInvoiceLine, summarizeInvoice, type InvoiceTotals, type SupplyType } from "./gst";
import { divRound, formatScaled, parseScaled } from "./money";

/**
 * How much of a sale to put on one invoice. Everything is in paise (BigInt) and measured on the
 * taxable (pre-GST) value, which is exact: GST rounding differs between the sale estimate and the
 * invoice (CGST/SGST rounded separately, grand total rounded to the rupee), the taxable value does not.
 */
export interface BillableItem {
  id: string;
  /** Total taxable value of the sale item. */
  taxable: string;
  /** What is still free to bill (not on any draft or issued invoice). */
  remaining: string;
}

export type BillMode =
  | { kind: "rest" }
  | { kind: "percent"; percent: string }
  | { kind: "amount"; amount: string };

export interface BillShare {
  itemId: string;
  /** Taxable amount to bill for this item, in the form "1234.56". */
  taxable: string;
}

const fail = (msg: string) => new Error(msg);

/** Splits a billing request over the sale's items. Never exceeds an item's remaining amount. */
export function planShares(items: BillableItem[], mode: BillMode): BillShare[] {
  const rem = items.map((i) => parseScaled(i.remaining, 2, "Remaining"));
  const tot = items.map((i) => parseScaled(i.taxable, 2, "Item value"));
  const totalRemaining = rem.reduce((a, b) => a + b, 0n);
  if (totalRemaining <= 0n) throw fail("Nothing is left to bill on this sale");

  let shares: bigint[];
  if (mode.kind === "rest") {
    shares = rem;
  } else if (mode.kind === "percent") {
    const bp = parseScaled(mode.percent, 2, "Percentage"); // 30.00% -> 3000
    if (bp <= 0n || bp > 10000n) throw fail("The percentage must be between 0 and 100");
    shares = tot.map((t, i) => {
      const s = divRound(t * bp, 10000n);
      return s < rem[i]! ? s : rem[i]!;
    });
  } else {
    const amount = parseScaled(mode.amount, 2, "Amount");
    if (amount <= 0n) throw fail("The amount must be greater than 0");
    if (amount > totalRemaining) throw fail(`Only ${formatScaled(totalRemaining, 2)} (before GST) is left to bill`);
    // Proportional to what is left on each item; leftover paise go to the largest fractions first.
    shares = rem.map((r) => (amount * r) / totalRemaining);
    let left = amount - shares.reduce((a, b) => a + b, 0n);
    const order = rem
      .map((r, i) => ({ i, frac: (amount * r) % totalRemaining }))
      .sort((a, b) => (b.frac > a.frac ? 1 : b.frac < a.frac ? -1 : a.i - b.i));
    for (const { i } of order) {
      if (left <= 0n) break;
      if (shares[i]! < rem[i]!) {
        shares[i]! += 1n;
        left -= 1n;
      }
    }
  }
  const out = shares.map((s, i) => ({ itemId: items[i]!.id, taxable: formatScaled(s, 2) })).filter((s) => parseScaled(s.taxable, 2) > 0n);
  if (out.length === 0) throw fail("That would bill nothing. Check the percentage or amount.");
  return out;
}

/** Taxable value a milestone stands for, given the sale's total taxable value. */
export function milestoneTaxable(m: { basis: "percent" | "amount"; percent: string | null; amount: string | null }, saleTaxable: string): bigint {
  if (m.basis === "amount") return parseScaled(m.amount ?? "0", 2);
  return divRound(parseScaled(saleTaxable, 2) * parseScaled(m.percent ?? "0", 2), 10000n);
}

export interface ScheduleEntry {
  position: number;
  title: string;
  /** Share of the contract value as a percentage ("15.00"); derived from the amount for amount-based milestones. */
  share: string;
  /** Before GST, "1234.56". */
  taxable: string;
  /** True for the milestone the invoice bills. */
  current: boolean;
}

/** The "where are we on this contract" figures recorded with each issued invoice. All before GST. */
export interface BillingStatement {
  contractValue: string;
  /** Issued invoices of the sale, not counting this one. */
  billedBefore: string;
  thisInvoice: string;
  billedToDate: string;
  /** Contract value not yet on any issued invoice; never negative. */
  balanceToBill: string;
  schedule: ScheduleEntry[];
  scheduleTotal: string;
  scheduleShare: string;
}

export function buildBillingStatement(input: {
  contractValue: string;
  billedBefore: string;
  thisInvoice: string;
  milestones: Array<{ position: number; title: string; basis: "percent" | "amount"; percent: string | null; taxable: string; id: string }>;
  currentMilestoneId: string | null;
}): BillingStatement {
  const contract = parseScaled(input.contractValue, 2, "Contract value");
  const before = parseScaled(input.billedBefore, 2, "Billed before");
  const now = parseScaled(input.thisInvoice, 2, "This invoice");
  const toDate = before + now;
  const share = (taxable: bigint) => (contract > 0n ? formatScaled(divRound(taxable * 10000n, contract), 2) : "0.00");
  const schedule = input.milestones.map((m) => ({
    position: m.position,
    title: m.title,
    share: m.basis === "percent" && m.percent ? formatScaled(parseScaled(m.percent, 2), 2) : share(parseScaled(m.taxable, 2)),
    taxable: m.taxable,
    current: m.id === input.currentMilestoneId,
  }));
  const total = input.milestones.reduce((a, m) => a + parseScaled(m.taxable, 2), 0n);
  return {
    contractValue: formatScaled(contract, 2),
    billedBefore: formatScaled(before, 2),
    thisInvoice: formatScaled(now, 2),
    billedToDate: formatScaled(toDate, 2),
    balanceToBill: formatScaled(contract > toDate ? contract - toDate : 0n, 2),
    schedule,
    scheduleTotal: formatScaled(total, 2),
    scheduleShare: share(total),
  };
}

/**
 * Everything the invoice PDF prints beyond the lines, frozen when the invoice is issued so later edits to
 * the sale or its billing plan never rewrite an issued invoice. `milestone` is null for an invoice that
 * does not bill a planned milestone.
 */
export interface DocumentSnapshot {
  version: 1;
  sale: { number: string; title: string; quotationNumber: string | null; agreementRef: string | null };
  milestone: { position: number; title: string; description: string | null; share: string } | null;
  statement: BillingStatement;
}

/**
 * An invoice line starts as the sale line's wording, plus " (<what it bills>)" when it bills only part of it: the
 * instalment's title, "Balance", "Part payment" or a percentage. This returns the line as it reads when the sale's wording
 * is `saleDescription` now, keeping whichever of those endings the line already has.
 */
export function lineDescriptionFromSale(currentLine: string, saleDescription: string, milestoneTitle?: string | null): string {
  const ending = milestoneTitle && currentLine.endsWith(` (${milestoneTitle})`)
    ? ` (${milestoneTitle})`
    : currentLine.match(/ \((?:Balance|Part payment|\d+(?:\.\d+)?%)\)$/)?.[0] ?? "";
  return `${saleDescription.trim()}${ending}`;
}

/**
 * Works back from an invoice total (incl. GST) to the taxable value of each line, so revising an issued invoice lands
 * on exactly the amount the client was asked to pay. The new taxable value is split over the lines in proportion to
 * what they bill now, then priced with the same GST routine issuing uses. Throws when no taxable value gives the target.
 */
export function reviseToTotal(
  lines: { id: string; taxable: string; taxRate: string }[], targetTotal: string, supply: SupplyType, roundToRupee: boolean,
): { shares: { id: string; taxable: string }[]; totals: InvoiceTotals } {
  const target = parseScaled(targetTotal, 2, "Total");
  const weights = lines.map((l) => parseScaled(l.taxable, 2, "Line value"));
  const weightSum = weights.reduce((a, b) => a + b, 0n);
  if (target <= 0n) throw fail("The total must be greater than 0");
  if (lines.length === 0 || weightSum <= 0n) throw fail("This invoice has no value to revise");

  const split = (t: bigint) => {
    const base = weights.map((w) => (t * w) / weightSum);
    let left = t - base.reduce((a, b) => a + b, 0n);
    const order = weights.map((w, i) => ({ i, frac: (t * w) % weightSum })).sort((a, b) => (b.frac > a.frac ? 1 : b.frac < a.frac ? -1 : a.i - b.i));
    for (const { i } of order) {
      if (left <= 0n) break;
      base[i]! += 1n;
      left -= 1n;
    }
    return base;
  };
  const priced = (t: bigint) => {
    const shares = split(t);
    const amounts = lines.map((l, i) => computeInvoiceLine({ quantity: "1", unitPrice: formatScaled(shares[i]!, 2), discountPercent: "0", taxRate: l.taxRate }, supply));
    const totals = summarizeInvoice(amounts, roundToRupee);
    return { shares, totals, total: parseScaled(totals.total, 2) };
  };

  // Smallest taxable value whose total reaches the target, then look around it: splitting the paise between lines can
  // make the total step by a paisa or two either way, so the exact total is searched for in a small window.
  let lo = 0n;
  let hi = target;
  while (lo < hi) {
    const mid = (lo + hi) / 2n;
    if (priced(mid).total >= target) hi = mid;
    else lo = mid + 1n;
  }
  let below: bigint | null = null;
  let above: bigint | null = null;
  for (let t = lo > 50n ? lo - 50n : 0n; t <= lo + 50n; t++) {
    const p = priced(t);
    if (p.total === target) return { shares: lines.map((l, i) => ({ id: l.id, taxable: formatScaled(p.shares[i]!, 2) })), totals: p.totals };
    if (p.total < target && (below === null || p.total > below)) below = p.total;
    if (p.total > target && (above === null || p.total < above)) above = p.total;
  }
  throw fail(`No amount before GST gives exactly ${formatScaled(target, 2)} with this GST. The nearest totals are ${below === null ? "none below" : formatScaled(below, 2)} and ${above === null ? "none above" : formatScaled(above, 2)}.`);
}
