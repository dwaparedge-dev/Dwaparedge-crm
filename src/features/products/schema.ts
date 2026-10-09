import { z } from "zod";
import { optionKey } from "@/features/options/schema";
import { decimal, optionalText, pageParams, requiredText } from "@/lib/validation";

export const productInputSchema = z
  .object({
    name: requiredText("Name"),
    sku: optionalText(60),
    type: optionKey("Type"),
    description: optionalText(2000),
    hsnSac: optionalText(12),
    defaultPrice: decimal(2, "Price"),
    gstRate: decimal(2, "GST rate").default("18"),
    isActive: z.boolean().default(true),
  })
  .refine((p) => Number(p.gstRate) <= 100, { path: ["gstRate"], message: "GST rate cannot exceed 100" });
export type ProductInput = z.infer<typeof productInputSchema>;

export const listProductsSchema = pageParams.extend({
  type: z.string().trim().max(80).optional(),
  active: z.enum(["true", "false"]).optional(),
});
