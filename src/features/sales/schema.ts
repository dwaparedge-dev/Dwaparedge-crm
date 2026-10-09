import { z } from "zod";
import { optionKey } from "@/features/options/schema";
import { decimal, isoDate, optionalText, pageParams, requiredText, uuid } from "@/lib/validation";

export const SALE_STATUSES = ["draft", "confirmed", "completed", "cancelled"] as const;

export const saleItemSchema = z.object({
  /** Present when editing an existing item, so its identity (and any invoice lines pointing at it) is kept. */
  itemId: z.preprocess((v) => (v === "" || v === null ? undefined : v), uuid.optional()),
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
  type: optionKey("Sale type"),
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
  from: isoDate.optional(),
  to: isoDate.optional(),
  clientId: uuid.optional(),
  status: z.enum(SALE_STATUSES).optional(),
  type: z.string().trim().max(80).optional(),
});

const optionalDecimal = (digits: number, label: string) => z.preprocess((v) => (v === "" || v === undefined ? null : v), decimal(digits, label).nullable().default(null));

export const milestoneInputSchema = z
  .object({
    id: z.preprocess((v) => (v === "" || v === null ? undefined : v), uuid.optional()),
    title: requiredText("Title", 100),
    basis: z.enum(["percent", "amount"], { error: "Choose percentage or amount" }),
    percent: optionalDecimal(2, "Percentage"),
    amount: optionalDecimal(2, "Amount"),
    dueDate: z.preprocess((v) => (v === "" ? null : v), isoDate.nullable().default(null)),
  })
  .superRefine((m, ctx) => {
    if (m.basis === "percent") {
      if (m.percent === null || Number(m.percent) <= 0 || Number(m.percent) > 100) ctx.addIssue({ code: "custom", path: ["percent"], message: "Enter a percentage between 0 and 100" });
    } else if (m.amount === null || Number(m.amount) <= 0) {
      ctx.addIssue({ code: "custom", path: ["amount"], message: "Enter an amount greater than 0" });
    }
  })
  .transform((m) => ({ ...m, percent: m.basis === "percent" ? m.percent : null, amount: m.basis === "amount" ? m.amount : null }));
export type MilestoneInput = z.infer<typeof milestoneInputSchema>;
export const milestonesSchema = z.object({ milestones: z.array(milestoneInputSchema).max(24) });

/** What to put on the next invoice of a sale. */
export const billSaleSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("rest") }),
  z.object({ mode: z.literal("percent"), percent: decimal(2, "Percentage").refine((v) => Number(v) > 0 && Number(v) <= 100, "Enter a percentage between 0 and 100") }),
  z.object({ mode: z.literal("amount"), amount: decimal(2, "Amount").refine((v) => Number(v) > 0, "Amount must be greater than 0") }),
  z.object({ mode: z.literal("milestone"), milestoneId: uuid }),
]);
export type BillSaleInput = z.infer<typeof billSaleSchema>;
