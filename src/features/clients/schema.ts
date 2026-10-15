import { z } from "zod";
import {
  optionalAccountNo, optionalEmail, optionalGstin, optionalIfsc, optionalPan, optionalPhone, optionalText, pageParams, requiredText, uuid,
} from "@/lib/validation";
import { INDIAN_STATES } from "@/lib/india";

/**
 * Brand names arrive as a list (or one comma-separated string), are trimmed and de-duplicated, and are stored
 * in clients.brand_names as "Aris, Apres". A name cannot contain a comma.
 */
const brandNames = z
  .preprocess((v) => (typeof v === "string" ? v.split(",") : v), z.array(z.string().max(100, "A brand name can be at most 100 characters")).default([]))
  .transform((list) => {
    const seen = new Set<string>();
    return list.map((b) => b.trim()).filter((b) => b && !seen.has(b.toLowerCase()) && seen.add(b.toLowerCase()));
  })
  .refine((list) => list.length <= 20, "Add at most 20 brand names")
  .transform((list) => (list.length ? list.join(", ") : null));

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
  ownerId: z.preprocess((v) => (v === "" ? null : v), uuid.nullable().default(null)),
  notes: optionalText(5000),
  brandNames,
  bankName: optionalText(150),
  bankAccountNo: optionalAccountNo,
  bankIfsc: optionalIfsc,
  bankBranch: optionalText(150),
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
  // The PAN is the middle of the GSTIN, so a blank PAN is filled from it.
  pan: v.pan ?? (v.gstin ? v.gstin.slice(2, 12) : null),
  // GSTIN is authoritative for the state when the state was left blank.
  stateCode: v.stateCode ?? (v.gstin ? v.gstin.slice(0, 2) : null),
}));
export type ClientInput = z.infer<typeof clientInputSchema>;

export const SORT_COLUMNS = { name: "c.display_name", created: "c.created_at" } as const;

export const listClientsSchema = pageParams.extend({
  archived: z.enum(["true", "false"]).default("false"),
  ownerId: uuid.optional(),
  sort: z.enum(["name", "created"]).default("name"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
export type ListClientsParams = z.infer<typeof listClientsSchema>;

/** Uploaded client documents. Stored in the database, so the size stays under the 4.5 MB request limit of the host. */
export const DOC_MAX_BYTES = 4 * 1024 * 1024;
export const DOC_MIME_BY_EXT = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;
export const DOC_ACCEPT = Object.keys(DOC_MIME_BY_EXT).map((e) => `.${e}`).join(",");

export const fileExtension = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";

export const documentMetaSchema = z.object({
  docName: requiredText("Document name"),
  docType: requiredText("Document type", 60),
});
export type DocumentMeta = z.infer<typeof documentMetaSchema>;
