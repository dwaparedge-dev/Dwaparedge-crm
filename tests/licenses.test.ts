import { describe, expect, it } from "vitest";
import { daysUntil, suggestRenewalExpiry, todayIST } from "@/lib/dates";
import { effectiveStatus } from "@/features/licenses/status";
import { licenseActionSchema, licenseInputSchema } from "@/features/licenses/schema";

const TODAY = "2026-10-09";

describe("dates", () => {
  it("counts calendar days", () => {
    expect(daysUntil("2026-10-16", TODAY)).toBe(7);
    expect(daysUntil("2026-10-09", TODAY)).toBe(0);
    expect(daysUntil("2026-10-08", TODAY)).toBe(-1);
  });
  it("uses the India date, not UTC", () => {
    // 20:00 UTC on 8 Oct is already 9 Oct 01:30 in India.
    expect(todayIST(new Date("2026-10-08T20:00:00Z"))).toBe("2026-10-09");
  });
  it("suggests renewal from the later of expiry and today", () => {
    expect(suggestRenewalExpiry("2027-01-31", 12, TODAY)).toBe("2028-01-31");
    expect(suggestRenewalExpiry("2026-01-31", 12, TODAY)).toBe("2027-10-09"); // lapsed: renew from today
    expect(suggestRenewalExpiry("2026-01-31", 1, "2026-01-31")).toBe("2026-02-28");
  });
});

describe("effectiveStatus", () => {
  it("marks active licenses past expiry as expired", () => {
    expect(effectiveStatus("active", "2026-10-08", TODAY)).toBe("expired");
  });
  it("keeps an active license valid through its expiry day", () => {
    expect(effectiveStatus("active", "2026-10-09", TODAY)).toBe("active");
  });
  it("never upgrades other statuses", () => {
    for (const s of ["pending", "suspended", "revoked"] as const) expect(effectiveStatus(s, "2020-01-01", TODAY)).toBe(s);
  });
});

describe("license schemas", () => {
  const base = { clientId: "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11", productId: "7c1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f22", plan: "Standard", startDate: "2026-10-01", expiryDate: "2027-09-30" };
  it("accepts a valid license with optional fields blank", () => {
    expect(licenseInputSchema.parse({ ...base, seatLimit: "", renewalPrice: "" })).toMatchObject({ seatLimit: null, renewalPrice: null });
  });
  it("requires expiry after start and positive whole seats", () => {
    expect(licenseInputSchema.safeParse({ ...base, expiryDate: "2026-10-01" }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ ...base, seatLimit: "0" }).success).toBe(false);
    expect(licenseInputSchema.safeParse({ ...base, seatLimit: "2.5" }).success).toBe(false);
  });
  it("requires a reason to suspend or revoke", () => {
    expect(licenseActionSchema.safeParse({ action: "suspend" }).success).toBe(false);
    expect(licenseActionSchema.safeParse({ action: "revoke", note: "  " }).success).toBe(false);
    expect(licenseActionSchema.safeParse({ action: "revoke", note: "Non-payment" }).success).toBe(true);
  });
  it("needs a valid new expiry to renew", () => {
    expect(licenseActionSchema.safeParse({ action: "renew" }).success).toBe(false);
    expect(licenseActionSchema.safeParse({ action: "renew", newExpiry: "2028-09-30", renewalPrice: "12000" }).success).toBe(true);
  });
});

import { presetRange } from "@/lib/dates";

describe("presetRange", () => {
  it("covers calendar months, including February and year boundaries", () => {
    expect(presetRange("this_month", "2026-02-10")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(presetRange("last_month", "2026-01-15")).toEqual(["2025-12-01", "2025-12-31"]);
    expect(presetRange("this_month", "2028-02-10")[1]).toBe("2028-02-29");
  });
  it("last 30 days includes today", () => {
    expect(presetRange("last_30", "2026-10-09")).toEqual(["2026-09-10", "2026-10-09"]);
  });
  it("financial years run April to March", () => {
    expect(presetRange("this_fy", "2026-10-09")).toEqual(["2026-04-01", "2027-03-31"]);
    expect(presetRange("this_fy", "2027-02-01")).toEqual(["2026-04-01", "2027-03-31"]);
    expect(presetRange("last_fy", "2026-10-09")).toEqual(["2025-04-01", "2026-03-31"]);
  });
});
