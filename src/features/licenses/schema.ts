import { z } from "zod";
import { decimal, isoDate, optionalText, pageParams, requiredText, uuid } from "@/lib/validation";

export const LICENSE_STATUSES = ["pending", "active", "expired", "suspended", "revoked"] as const;

const optionalPrice = z.preprocess((v) => (v === "" || v === undefined ? null : v), decimal(2, "Renewal price").nullable().default(null));
const optionalSeats = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.coerce.number().int("Seats must be a whole number").min(1, "Seats must be at least 1").max(1_000_000).nullable().default(null),
);

export const licenseInputSchema = z
  .object({
    clientId: uuid,
    productId: uuid,
    plan: requiredText("Plan", 100),
    startDate: isoDate,
    expiryDate: isoDate,
    seatLimit: optionalSeats,
    renewalPrice: optionalPrice,
    renewalTerms: optionalText(2000),
    notes: optionalText(5000),
  })
  .refine((l) => l.expiryDate > l.startDate, { path: ["expiryDate"], message: "Expiry must be after the start date" });
export type LicenseInput = z.infer<typeof licenseInputSchema>;

const note = z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? undefined : v), z.string().trim().max(1000).optional());
const requiredNote = (label: string) => z.string({ error: `${label} is required` }).trim().min(3, `${label} is required`).max(1000);

export const licenseActionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("activate"), note }),
  z.object({ action: z.literal("renew"), newExpiry: isoDate, renewalPrice: optionalPrice, note }),
  z.object({ action: z.literal("suspend"), note: requiredNote("A reason") }),
  z.object({ action: z.literal("reinstate"), note }),
  z.object({ action: z.literal("revoke"), note: requiredNote("A reason") }),
]);
export type LicenseAction = z.infer<typeof licenseActionSchema>;

export const listLicensesSchema = pageParams.extend({
  clientId: uuid.optional(),
  productId: uuid.optional(),
  status: z.enum(LICENSE_STATUSES).optional(),
  /** Licenses whose expiry falls within N days (includes already-expired, not-revoked ones when "renewals"). */
  expiringWithin: z.coerce.number().int().min(0).max(730).optional(),
  sort: z.enum(["expiry", "client", "created"]).default("expiry"),
  dir: z.enum(["asc", "desc"]).default("asc"),
});
