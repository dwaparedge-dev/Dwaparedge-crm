import { describe, expect, it } from "vitest";
import { computeInvoiceLine, financialYear, summarizeInvoice, supplyType } from "@/lib/gst";
import { amountInWordsINR, integerInWords } from "@/lib/words";

describe("supplyType", () => {
  it("is intra-state when states match, inter-state otherwise", () => {
    expect(supplyType("24", "24")).toBe("intra");
    expect(supplyType("24", "27")).toBe("inter");
  });
  it("refuses to guess when a state is missing", () => {
    expect(() => supplyType(null, "24")).toThrow(/company state/);
    expect(() => supplyType("24", "")).toThrow(/Place of supply/);
  });
});

describe("computeInvoiceLine", () => {
  const item = { unitPrice: "1000", quantity: "3", discountPercent: "10", taxRate: "18" };
  it("splits 18% into 9% CGST + 9% SGST for intra-state", () => {
    expect(computeInvoiceLine(item, "intra")).toEqual({
      gross: "3000.00", discount: "300.00", taxable: "2700.00", cgst: "243.00", sgst: "243.00", igst: "0.00", tax: "486.00", total: "3186.00",
    });
  });
  it("charges IGST at the full rate for inter-state", () => {
    expect(computeInvoiceLine(item, "inter")).toMatchObject({ cgst: "0.00", sgst: "0.00", igst: "486.00", tax: "486.00", total: "3186.00" });
  });
  it("keeps tax = cgst + sgst even when half-rate rounding is awkward", () => {
    // 0.25 taxable at 18%: each half = 0.0225 -> 0.02, so tax is 0.04 (not 0.05)
    const l = computeInvoiceLine({ unitPrice: "0.25", quantity: "1", taxRate: "18" }, "intra");
    expect(l).toMatchObject({ cgst: "0.02", sgst: "0.02", tax: "0.04", total: "0.29" });
  });
  it("handles zero-rated / exempt lines", () => {
    expect(computeInvoiceLine({ unitPrice: "500", quantity: "2", taxRate: "0" }, "intra")).toMatchObject({ tax: "0.00", total: "1000.00" });
  });
  it("supports different rates per line", () => {
    const a = computeInvoiceLine({ unitPrice: "1000", quantity: "1", taxRate: "5" }, "inter");
    const b = computeInvoiceLine({ unitPrice: "1000", quantity: "1", taxRate: "28" }, "inter");
    expect([a.igst, b.igst]).toEqual(["50.00", "280.00"]);
  });
});

describe("summarizeInvoice", () => {
  const lines = [
    computeInvoiceLine({ unitPrice: "33.33", quantity: "1", taxRate: "18" }, "intra"),
    computeInvoiceLine({ unitPrice: "100.10", quantity: "1", taxRate: "12" }, "intra"),
  ];
  it("sums exactly and rounds the grand total to the rupee with an explicit round-off", () => {
    const t = summarizeInvoice(lines, true);
    const exact = Number(t.total) - Number(t.roundOff);
    expect(Number(t.total) % 1).toBe(0);
    expect(Math.abs(Number(t.roundOff))).toBeLessThanOrEqual(0.5);
    expect(exact.toFixed(2)).toBe((Number(t.subtotal) + Number(t.tax)).toFixed(2));
  });
  it("leaves the total untouched when rounding is off", () => {
    const t = summarizeInvoice(lines, false);
    expect(t.roundOff).toBe("0.00");
    expect(Number(t.total).toFixed(2)).toBe((Number(t.subtotal) + Number(t.tax)).toFixed(2));
  });
  it("handles an empty invoice", () => {
    expect(summarizeInvoice([], true).total).toBe("0.00");
  });
});

describe("financialYear", () => {
  it("runs April to March", () => {
    expect(financialYear("2026-04-01")).toBe("2026-27");
    expect(financialYear("2027-03-31")).toBe("2026-27");
    expect(financialYear("2026-03-31")).toBe("2025-26");
    expect(financialYear("2099-12-31")).toBe("2099-00");
  });
});

describe("amount in words", () => {
  it("uses lakh and crore", () => {
    expect(integerInWords(100000)).toBe("One Lakh");
    expect(integerInWords(12345678)).toBe("One Crore Twenty Three Lakh Forty Five Thousand Six Hundred Seventy Eight");
    expect(integerInWords(0)).toBe("Zero");
  });
  it("adds paise", () => {
    expect(amountInWordsINR("3186.00")).toBe("Rupees Three Thousand One Hundred Eighty Six Only");
    expect(amountInWordsINR("1180.50")).toBe("Rupees One Thousand One Hundred Eighty and Fifty Paise Only");
    expect(amountInWordsINR("0.05")).toBe("Rupees Zero and Five Paise Only");
  });
});
