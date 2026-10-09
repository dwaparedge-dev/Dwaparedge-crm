import { z } from "zod";
import { optionKey } from "@/features/options/schema";
import { decimal, isoDate, optionalText, pageParams, uuid } from "@/lib/validation";


export const allocationInputSchema = z.object({
  invoiceId: uuid,
  amount: decimal(2, "Amount").refine((v) => Number(v) > 0, "Amount must be greater than 0"),
});
export type AllocationInput = z.infer<typeof allocationInputSchema>;

export const paymentInputSchema = z
  .object({
    clientId: uuid,
    /** Tag the payment to a sale: whatever is not allocated to an invoice yet is that sale's advance. */
    saleId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().default(null)),
    paymentDate: isoDate,
    amount: decimal(2, "Amount").refine((v) => Number(v) > 0, "Amount must be greater than 0"),
    method: optionKey("Payment method"),
    reference: optionalText(100),
    notes: optionalText(1000),
    allocations: z.array(allocationInputSchema).max(100).default([]),
  })
  .refine((p) => new Set(p.allocations.map((a) => a.invoiceId)).size === p.allocations.length, { path: ["allocations"], message: "Each invoice can appear only once" });
export type PaymentInput = z.infer<typeof paymentInputSchema>;

export const allocateSchema = z.object({
  allocations: z.array(allocationInputSchema).min(1, "Add at least one allocation").max(100),
});

const reason = z.string({ error: "A reason is required" }).trim().min(3, "A reason is required").max(1000);
export const reasonSchema = z.object({ reason });

export const listPaymentsSchema = pageParams.extend({
  clientId: uuid.optional(),
  saleId: uuid.optional(),
  method: z.string().trim().max(80).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  includeVoided: z.enum(["true", "false"]).default("false"),
});

export const applyAdvanceSchema = z.object({ invoiceId: z.preprocess((v) => (v === "" ? undefined : v), uuid.optional()) });
