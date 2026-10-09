import { z } from "zod";

export const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
export const PAN_RE = /^[A-Z]{5}\d{4}[A-Z]$/;

/** Trims; turns "" into null. */
const emptyToNull = (v: unknown) => (typeof v === "string" ? (v.trim() === "" ? null : v.trim()) : v);

export const optionalText = (max = 500) => z.preprocess(emptyToNull, z.string().max(max).nullable().default(null));
export const requiredText = (label: string, max = 200) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(max);
export const optionalEmail = z.preprocess(emptyToNull, z.string().email("Enter a valid email").max(254).nullable().default(null));
export const optionalPhone = z.preprocess(
  emptyToNull,
  z.string().regex(/^[0-9+()\-\s]{6,20}$/, "Enter a valid phone number").nullable().default(null),
);
export const optionalGstin = z.preprocess(
  (v) => emptyToNull(typeof v === "string" ? v.toUpperCase() : v),
  z.string().regex(GSTIN_RE, "Enter a valid 15-character GSTIN").nullable().default(null),
);
export const optionalPan = z.preprocess(
  (v) => emptyToNull(typeof v === "string" ? v.toUpperCase() : v),
  z.string().regex(PAN_RE, "Enter a valid 10-character PAN").nullable().default(null),
);

export const uuid = z.string().uuid();

export const pageParams = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
});

/** Escape % and _ so user input is matched literally by ILIKE. */
export const likePattern = (s: string) => `%${s.replace(/[\\%_]/g, "\\$&")}%`;

/** Non-negative decimal accepted as string or number, kept as a string (never a float). */
export const decimal = (maxDecimals: number, label: string) =>
  z
    .union([z.string(), z.number()], { error: `${label} is required` })
    .transform((v) => String(v).trim())
    .refine((v) => new RegExp(`^\\d+(\\.\\d{1,${maxDecimals}})?$`).test(v), `${label} must be a number with at most ${maxDecimals} decimals`);

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date").refine((s) => !Number.isNaN(Date.parse(s)), "Use a valid date");
