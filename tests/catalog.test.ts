import { describe, expect, it } from "vitest";
import { productInputSchema } from "@/features/products/schema";
import { saleInputSchema } from "@/features/sales/schema";

const base = { name: "FactoONE license", type: "software_license", defaultPrice: "25000" };

describe("product schema", () => {
  it("applies defaults", () => {
    const p = productInputSchema.parse(base);
    expect(p).toMatchObject({ gstRate: "18", isActive: true, sku: null });
  });
  it("accepts any option key for the type (validated against field_options by the service)", () => {
    expect(productInputSchema.parse({ ...base, type: "training_course" }).type).toBe("training_course");
    expect(productInputSchema.safeParse({ ...base, type: "" }).success).toBe(false);
  });
  it("rejects prices with more than 2 decimals and negatives", () => {
    expect(productInputSchema.safeParse({ ...base, defaultPrice: "1.234" }).success).toBe(false);
    expect(productInputSchema.safeParse({ ...base, defaultPrice: "-5" }).success).toBe(false);
  });
  it("rejects GST above 100", () => {
    expect(productInputSchema.safeParse({ ...base, gstRate: "101" }).success).toBe(false);
  });
});

describe("sale schema", () => {
  const sale = {
    clientId: "6b1a9d5e-8c43-4f5b-9d39-0f3f3b0f2f11", type: "license", title: "Annual license", saleDate: "2026-10-09",
    items: [{ description: "License", quantity: "2", unitPrice: "1000" }],
  };
  it("accepts a valid sale and defaults discount/tax", () => {
    const s = saleInputSchema.parse(sale);
    expect(s.items[0]).toMatchObject({ discountPercent: "0", taxRate: "0", productId: null });
  });
  it("needs at least one item and positive quantity", () => {
    expect(saleInputSchema.safeParse({ ...sale, items: [] }).success).toBe(false);
    expect(saleInputSchema.safeParse({ ...sale, items: [{ description: "x", quantity: "0", unitPrice: "1" }] }).success).toBe(false);
  });
  it("rejects a discount above 100%", () => {
    expect(saleInputSchema.safeParse({ ...sale, items: [{ ...sale.items[0], discountPercent: "101" }] }).success).toBe(false);
  });
});
