import { z } from "zod";
import { isoDate, optionalText, pageParams, uuid } from "@/lib/validation";
import { saleItemSchema } from "@/features/sales/schema";

export const INVOICE_TYPES = ["project", "software_sale", "subscription_renewal", "implementation", "service", "milestone", "other"] as const;
export const INVOICE_TYPE_LABELS: Record<(typeof INVOICE_TYPES)[number], string> = {
  project: "Project invoice",
  software_sale: "Software sale",
  subscription_renewal: "Subscription / renewal",
  implementation: "Implementation & customization",
  service: "Service invoice",
  milestone: "Milestone billing",
  other: "Other",
};

export const invoiceInputSchema = z
  .object({
    clientId: uuid,
    invoiceType: z.enum(INVOICE_TYPES, { error: "Select an invoice type" }),
    issueDate: isoDate,
    dueDate: isoDate,
    placeOfSupplyStateCode: z.preprocess((v) => (v === "" ? null : v), z.string().regex(/^\d{2}$/, "Select a state").nullable().default(null)),
    paymentTerms: optionalText(1000),
    notes: optionalText(2000),
    items: z.array(saleItemSchema).min(1, "Add at least one item").max(100),
  })
  .refine((v) => v.dueDate >= v.issueDate, { path: ["dueDate"], message: "Due date cannot be before the issue date" });
export type InvoiceInput = z.infer<typeof invoiceInputSchema>;

export const cancelSchema = z.object({ reason: z.string({ error: "A reason is required" }).trim().min(3, "A reason is required").max(1000) });

export const listInvoicesSchema = pageParams.extend({
  clientId: uuid.optional(),
  status: z.enum(["draft", "issued", "cancelled"]).optional(),
  paymentStatus: z.enum(["unpaid", "partial", "paid", "overdue"]).optional(),
  /** Issued invoices that still have a balance (for payment allocation). */
  openOnly: z.enum(["true"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
});
