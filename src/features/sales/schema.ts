import { z } from "zod";
import { decimal, isoDate, optionalText, pageParams, requiredText, uuid } from "@/lib/validation";

export const SALE_TYPES = ["project", "license", "service"] as const;
export const SALE_STATUSES = ["draft", "confirmed", "completed", "cancelled"] as const;

export const saleItemSchema = z.object({
  productId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().default(null)),
  description: requiredText("Description", 500),
  hsnSac: optionalText(12),
  quantity: decimal(3, "Quantity").refine((v) => Number(v) > 0, "Quantity must be greater than 0"),
  unitPrice: decimal(2, "Unit price"),
  discountPercent: decimal(2, "Discount").default("0").refine((v) => Number(v) <= 100, "Discount cannot exceed 100%"),
  taxRate: decimal(2, "Tax rate").default("0").refine((v) => Number(v) <= 100, "Tax rate cannot exceed 100%"),
});
export type SaleItemInput = z.infer<typeof saleItemSchema>;

export const saleInputSchema = z.object({
  clientId: uuid,
  type: z.enum(SALE_TYPES, { error: "Select a sale type" }),
  title: requiredText("Title"),
  ownerId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().default(null)),
  saleDate: isoDate,
  expectedClose: z.preprocess((v) => (v === "" ? null : v), isoDate.nullable().default(null)),
  notes: optionalText(5000),
  items: z.array(saleItemSchema).min(1, "Add at least one item").max(100),
});
export type SaleInput = z.infer<typeof saleInputSchema>;

export const saleStatusSchema = z.object({ status: z.enum(["confirmed", "completed", "cancelled"]) });

export const listSalesSchema = pageParams.extend({
  clientId: uuid.optional(),
  status: z.enum(SALE_STATUSES).optional(),
  type: z.enum(SALE_TYPES).optional(),
});
