import { z } from "zod";
import { isoDate, optionalText, pageParams, uuid } from "@/lib/validation";
import { saleItemSchema } from "@/features/sales/schema";

/** Every invoice line bills a line of the sale it belongs to. */
export const invoiceItemSchema = saleItemSchema.omit({ itemId: true }).extend({ saleItemId: uuid });

export const invoiceInputSchema = z
  .object({
    saleId: uuid,
    issueDate: isoDate,
    dueDate: isoDate,
    placeOfSupplyStateCode: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{2}$/, "Select a state").nullable().default(null)),
    paymentTerms: optionalText(1000),
    notes: optionalText(2000),
    items: z.array(invoiceItemSchema).min(1, "Add at least one item").max(100),
  })
  .refine((v) => v.dueDate >= v.issueDate, { path: ["dueDate"], message: "Due date cannot be before the issue date" });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const cancelSchema = z.object({ reason: z.string({ error: "A reason is required" }).trim().min(3, "A reason is required").max(1000) });

export const listInvoicesSchema = pageParams.extend({
  clientId: uuid.optional(),
  saleId: uuid.optional(),
  status: z.enum(["draft", "issued", "cancelled"]).optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid", "overdue"]).optional(),
  /** Issued invoices that still have a balance (for payment allocation). */
  openOnly: z.enum(["true"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
