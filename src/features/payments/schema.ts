import { z } from "zod";
import { decimal, isoDate, optionalText, pageParams, uuid } from "@/lib/validation";

export const PAYMENT_METHODS = ["bank_transfer", "upi", "cash", "cheque", "other"] as const;
export const PAYMENT_METHOD_LABELS: Record<(typeof PAYMENT_METHODS)[number], string> = {
  bank_transfer: "Bank transfer", upi: "UPI", cash: "Cash", cheque: "Cheque", other: "Other",
};

export const allocationInputSchema = z.object({
  invoiceId: uuid,
  amount: decimal(2, "Amount").refine((v) => Number(v) > 0, "Amount must be greater than 0"),
});
export type AllocationInput = z.infer<typeof allocationInputSchema>;

export const paymentInputSchema = z
  .object({
    clientId: uuid,
    paymentDate: isoDate,
    amount: decimal(2, "Amount").refine((v) => Number(v) > 0, "Amount must be greater than 0"),
    method: z.enum(PAYMENT_METHODS, { error: "Select a payment method" }),
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
  method: z.enum(PAYMENT_METHODS).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  includeVoided: z.enum(["true", "false"]).default("false"),
});
