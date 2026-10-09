import { z } from "zod";
import { decimal, optionalText, pageParams, requiredText } from "@/lib/validation";

export const PRODUCT_TYPES = [
  "software_license", "software_subscription", "implementation", "custom_development",
  "consulting", "support_maintenance", "other",
] as const;

export const PRODUCT_TYPE_LABELS: Record<(typeof PRODUCT_TYPES)[number], string> = {
  software_license: "Software license",
  software_subscription: "Software subscription",
  implementation: "Implementation",
  custom_development: "Custom development",
  consulting: "Consulting",
  support_maintenance: "Support & maintenance",
  other: "Other service",
};

export const productInputSchema = z
  .object({
    name: requiredText("Name"),
    sku: optionalText(60),
    type: z.enum(PRODUCT_TYPES, { error: "Select a type" }),
    description: optionalText(2000),
    hsnSac: optionalText(12),
    defaultPrice: decimal(2, "Price"),
    currency: z.literal("INR").default("INR"),
    gstRate: decimal(2, "GST rate").default("18"),
    isTaxExempt: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((p) => Number(p.gstRate) <= 100, { path: ["gstRate"], message: "GST rate cannot exceed 100" })
  .transform((p) => ({ ...p, gstRate: p.isTaxExempt ? "0" : p.gstRate }));
export type ProductInput = z.infer<typeof productInputSchema>;

export const listProductsSchema = pageParams.extend({
  type: z.enum(PRODUCT_TYPES).optional(),
  active: z.enum(["true", "false"]).optional(),
});
