import { z } from "zod";
import {
  optionalEmail, optionalGstin, optionalPan, optionalPhone, optionalText, pageParams, requiredText, uuid,
} from "@/lib/validation";
import { INDIAN_STATES } from "@/lib/india";

const clientFields = z.object({
  legalName: requiredText("Legal name"),
  displayName: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(200).optional()),
  gstin: optionalGstin,
  pan: optionalPan,
  email: optionalEmail,
  phone: optionalPhone,
  billingAddress: optionalText(1000),
  shippingAddress: optionalText(1000),
  city: optionalText(100),
  stateCode: z.preprocess(
    (v) => (v === "" ? null : v),
    z.string().refine((c) => INDIAN_STATES.some((s) => s.code === c), "Select a valid state").nullable().default(null),
  ),
  postalCode: optionalText(12),
  country: z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(100).default("India")),
  status: z.enum(["active", "inactive"]).default("active"),
  ownerId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().default(null)),
  notes: optionalText(5000),
});

/** Cross-field rules shared by create and update. */
const crossChecks = <T extends z.infer<typeof clientFields>>(v: T, ctx: z.RefinementCtx) => {
  if (v.gstin && v.pan && v.gstin.slice(2, 12) !== v.pan) {
    ctx.addIssue({ code: "custom", path: ["pan"], message: "PAN does not match the PAN inside the GSTIN" });
  }
  if (v.gstin && v.stateCode && v.gstin.slice(0, 2) !== v.stateCode) {
    ctx.addIssue({ code: "custom", path: ["stateCode"], message: "State does not match the GSTIN state code" });
  }
};

export const clientInputSchema = clientFields.superRefine(crossChecks).transform((v) => ({
  ...v,
  displayName: v.displayName || v.legalName,
  // GSTIN is authoritative for the state when the state was left blank.
  stateCode: v.stateCode ?? (v.gstin ? v.gstin.slice(0, 2) : null),
}));
export type ClientInput = z.infer<typeof clientInputSchema>;

export const SORT_COLUMNS = { name: "c.display_name", created: "c.created_at", status: "c.status" } as const;

export const listClientsSchema = pageParams.extend({
  status: z.enum(["active", "inactive"]).optional(),
  archived: z.enum(["true", "false"]).default("false"),
  ownerId: uuid.optional(),
  sort: z.enum(["name", "created", "status"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListClientsParams = z.infer<typeof listClientsSchema>;
