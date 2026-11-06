import { describe, expect, it } from "vitest";
import { clientCodeFromIndex, invoiceNumber, invoiceNumberMatchesDate, invoiceNumberMonth, MAX_CLIENT_CODES, mmyy, monthScope, quotationNumber, saleNumber } from "@/lib/numbering";

describe("client codes", () => {
  it("run AA01..AA99, then AB01, and roll the first letter after AZ99", () => {
    expect(clientCodeFromIndex(1)).toBe("AA01");
    expect(clientCodeFromIndex(2)).toBe("AA02");
    expect(clientCodeFromIndex(99)).toBe("AA99");
    expect(clientCodeFromIndex(100)).toBe("AB01");
    expect(clientCodeFromIndex(2574)).toBe("AZ99");
    expect(clientCodeFromIndex(2575)).toBe("BA01");
    expect(clientCodeFromIndex(MAX_CLIENT_CODES)).toBe("ZZ99");
  });
  it("never repeats", () => {
    const seen = new Set<string>();
    for (let n = 1; n <= MAX_CLIENT_CODES; n++) seen.add(clientCodeFromIndex(n));
    expect(seen.size).toBe(MAX_CLIENT_CODES);
  });
  it("refuses numbers outside the range", () => {
    expect(() => clientCodeFromIndex(0)).toThrow();
    expect(() => clientCodeFromIndex(1.5)).toThrow();
    expect(() => clientCodeFromIndex(MAX_CLIENT_CODES + 1)).toThrow(/used up/);
  });
});

describe("document numbers", () => {
  it("builds the formats from the agreed pattern", () => {
    expect(mmyy("2026-10-12")).toBe("1026");
    expect(mmyy("2027-01-01")).toBe("0127");
    expect(saleNumber("AA01", 1)).toBe("SL-AA01-01");
    expect(quotationNumber("2026-10-12", "AA01", 1)).toBe("QT-1026-AA01-01");
    expect(invoiceNumber("2026-10-12", "AA01", 1)).toBe("INV-1026-AA01-01");
    expect(monthScope("2026-10-12", "AA01")).toBe("AA01-1026");
  });
  it("keeps invoice numbers within GST's 16 characters", () => {
    expect(invoiceNumber("2026-10-12", "AA01", 99)).toHaveLength(16);
    expect(() => invoiceNumber("2026-10-12", "AA01", 100)).toThrow(/16 characters/);
  });
  it("rejects a bad date", () => {
    expect(() => mmyy("12/10/2026")).toThrow();
  });
});

describe("invoice number month", () => {
  it("reads the month and year out of an invoice number", () => {
    expect(invoiceNumberMonth("INV-1026-AA01-01")).toBe("1026");
    expect(invoiceNumberMonth("INV-0127-ZZ99-12")).toBe("0127");
    expect(invoiceNumberMonth("2026/27/0001")).toBeNull();
    expect(invoiceNumberMonth("INV-1026-AA01-123")).toBeNull();
  });
  it("matches a date only in the same month and year", () => {
    expect(invoiceNumberMatchesDate("INV-1026-AA01-01", "2026-10-31")).toBe(true);
    expect(invoiceNumberMatchesDate("INV-1026-AA01-01", "2026-11-01")).toBe(false);
    expect(invoiceNumberMatchesDate("INV-1026-AA01-01", "2025-10-15")).toBe(false);
    expect(invoiceNumberMatchesDate("legacy-number", "2026-10-15")).toBe(false);
  });
});
