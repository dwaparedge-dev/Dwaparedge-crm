import { describe, expect, it } from "vitest";
import { computeLine, divRound, formatScaled, parseScaled, sumAmounts } from "@/lib/money";

describe("scaled parsing", () => {
  it("parses and formats without floats", () => {
    expect(parseScaled("1234.5", 2)).toBe(123450n);
    expect(formatScaled(123450n, 2)).toBe("1234.50");
    expect(formatScaled(5n, 2)).toBe("0.05");
    expect(formatScaled(-5n, 2)).toBe("-0.05");
  });
  it("rejects garbage and excess precision", () => {
    expect(() => parseScaled("abc", 2)).toThrow();
    expect(() => parseScaled("1.234", 2)).toThrow(/at most 2/);
    expect(parseScaled("1.230", 2)).toBe(123n); // trailing zeros are fine
  });
});

describe("divRound", () => {
  it("rounds half away from zero", () => {
    expect(divRound(5n, 2n)).toBe(3n);
    expect(divRound(-5n, 2n)).toBe(-3n);
    expect(divRound(4n, 3n)).toBe(1n);
    expect(divRound(7n, 3n)).toBe(2n);
  });
});

describe("computeLine", () => {
  it("computes quantity, discount and GST exactly", () => {
    // 3 x 1,000.00 = 3,000.00; 10% off = 2,700.00; 18% GST = 486.00
    expect(computeLine({ unitPrice: "1000", quantity: "3", discountPercent: "10", taxRate: "18" })).toEqual({
      gross: "3000.00", discount: "300.00", taxable: "2700.00", tax: "486.00", total: "3186.00",
    });
  });
  it("avoids the classic float errors", () => {
    // 0.1 + 0.2 style: 3 x 0.10 must be exactly 0.30
    expect(computeLine({ unitPrice: "0.10", quantity: "3" }).taxable).toBe("0.30");
    // 1.005 style rounding: 33.33 x 1 at 18% = 5.9994 -> 6.00
    expect(computeLine({ unitPrice: "33.33", quantity: "1", taxRate: "18" }).tax).toBe("6.00");
  });
  it("handles fractional quantities and exempt items", () => {
    expect(computeLine({ unitPrice: "100", quantity: "1.5", taxRate: "0" })).toMatchObject({ taxable: "150.00", tax: "0.00", total: "150.00" });
  });
  it("applies half-up rounding to tax", () => {
    // 0.25 x 18% = 0.045 -> 0.05
    expect(computeLine({ unitPrice: "0.25", quantity: "1", taxRate: "18" }).tax).toBe("0.05");
  });
  it("sums exactly", () => {
    expect(sumAmounts(["0.10", "0.20", "0.30"])).toBe("0.60");
  });
});
