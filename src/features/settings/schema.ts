import { z } from "zod";
import { INDIAN_STATES } from "@/lib/india";
import { optionalEmail, optionalGstin, optionalPan, optionalPhone, optionalText, requiredText } from "@/lib/validation";

export const settingsSchema = z
  .object({
    legalName: requiredText("Legal name"),
    tradeName: optionalText(200),
    address: requiredText("Address", 1000),
    city: optionalText(100),
    stateCode: z.string({ error: "Select your state" }).refine((c) => INDIAN_STATES.some((s) => s.code === c), "Select your state"),
    postalCode: optionalText(12),
    gstin: optionalGstin,
    pan: optionalPan,
    email: optionalEmail,
    phone: optionalPhone,
    website: optionalText(200),
    bankAccountName: optionalText(200),
    bankName: optionalText(200),
    bankAccountNumber: optionalText(40),
    bankIfsc: optionalText(20),
    bankBranch: optionalText(200),
    upiId: optionalText(100),
    invoicePrefix: z.string().trim().min(1, "Required").max(10).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
    receiptPrefix: z.string().trim().min(1, "Required").max(10).regex(/^[A-Za-z0-9-]+$/, "Letters, numbers and dashes only"),
    defaultDueDays: z.coerce.number().int().min(0).max(365),
    defaultPaymentTerms: optionalText(1000),
    defaultInvoiceNotes: optionalText(2000),
    signatoryName: optionalText(200),
    roundOffTotal: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.gstin && v.gstin.slice(0, 2) !== v.stateCode) ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State does not match the GSTIN state code" });
    if (v.gstin && v.pan && v.gstin.slice(2, 12) !== v.pan) ctx.addIssue({ code: "custom", path: ["pan"], message: "PAN does not match the GSTIN" });
  });
export type SettingsInput = z.infer<typeof settingsSchema>;
