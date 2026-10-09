import { describe, expect, it } from "vitest";
import { milestoneTaxable, planShares, type BillableItem } from "@/lib/billing";
import { formatScaled, parseScaled } from "@/lib/money";

const item = (id: string, taxable: string, remaining = taxable): BillableItem => ({ id, taxable, remaining });
const sum = (s: { taxable: string }[]) => s.reduce((a, x) => a + parseScaled(x.taxable, 2), 0n);

describe("planShares", () => {
  const items = [item("a", "10000.00"), item("b", "5000.00"), item("c", "333.33")];

  it("bills everything that is left", () => {
    expect(planShares(items, { kind: "rest" }).map((s) => s.taxable)).toEqual(["10000.00", "5000.00", "333.33"]);
  });
  it("bills a percentage of each item", () => {
    expect(planShares(items, { kind: "percent", percent: "30" })).toEqual([
      { itemId: "a", taxable: "3000.00" }, { itemId: "b", taxable: "1500.00" }, { itemId: "c", taxable: "100.00" },
    ]);
  });
  it("splits an amount in proportion to what is left, to the paisa", () => {
    const s = planShares(items, { kind: "amount", amount: "5000" });
    expect(sum(s)).toBe(500000n);
    // 10000 : 5000 : 333.33 of 15333.33
    expect(s.map((x) => x.taxable)).toEqual(["3260.87", "1630.44", "108.69"]);
  });
  it("never exceeds an item's remaining amount", () => {
    const partly = [item("a", "1000.00", "100.00"), item("b", "1000.00", "1000.00")];
    const s = planShares(partly, { kind: "amount", amount: "1100" });
    expect(s).toEqual([{ itemId: "a", taxable: "100.00" }, { itemId: "b", taxable: "1000.00" }]);
    expect(planShares(partly, { kind: "percent", percent: "50" })).toEqual([{ itemId: "a", taxable: "100.00" }, { itemId: "b", taxable: "500.00" }]);
  });
  it("refuses more than is left, and nonsense", () => {
    expect(() => planShares(items, { kind: "amount", amount: "15333.34" })).toThrow(/Only 15333.33/);
    expect(() => planShares(items, { kind: "percent", percent: "0" })).toThrow();
    expect(() => planShares(items, { kind: "percent", percent: "100.01" })).toThrow();
    expect(() => planShares(items, { kind: "amount", amount: "0" })).toThrow();
    expect(() => planShares([item("a", "10.00", "0.00")], { kind: "rest" })).toThrow(/Nothing is left/);
  });

  it("three instalments of 30/40/30 add up exactly, whatever the rounding", () => {
    // Awkward values that do not divide evenly.
    const sale = [item("a", "33333.33"), item("b", "1234.57"), item("c", "0.07")];
    const remaining = sale.map((s) => ({ ...s }));
    let billed = 0n;
    const bill = (mode: Parameters<typeof planShares>[1]) => {
      const shares = planShares(remaining, mode);
      for (const sh of shares) {
        const r = remaining.find((x) => x.id === sh.itemId)!;
        r.remaining = formatScaled(parseScaled(r.remaining, 2) - parseScaled(sh.taxable, 2), 2);
      }
      billed += sum(shares);
    };
    bill({ kind: "percent", percent: "30" });
    bill({ kind: "percent", percent: "40" });
    bill({ kind: "rest" }); // the last instalment takes the exact remainder
    expect(billed).toBe(parseScaled("34567.97", 2));
    expect(remaining.every((r) => parseScaled(r.remaining, 2) === 0n)).toBe(true);
  });
});

describe("milestoneTaxable", () => {
  it("is a share of the sale for percentages and fixed for amounts", () => {
    expect(milestoneTaxable({ basis: "percent", percent: "30", amount: null }, "10000.00")).toBe(300000n);
    expect(milestoneTaxable({ basis: "percent", percent: "33.33", amount: null }, "100.00")).toBe(3333n);
    expect(milestoneTaxable({ basis: "amount", percent: null, amount: "2500.50" }, "10000.00")).toBe(250050n);
  });
});
