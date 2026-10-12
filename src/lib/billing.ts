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
