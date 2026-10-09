import { z } from "zod";
import { OPTION_FIELD_KEYS } from "./registry";

const target = z.object({
  table: z.string().trim().min(1),
  column: z.string().trim().min(1),
});
export const listOptionsSchema = target.extend({ all: z.enum(["true", "false"]).optional() });
export const addOptionSchema = target.extend({
  label: z.string({ error: "Enter a name" }).trim().min(1, "Enter a name").max(60, "At most 60 characters"),
});
export const updateOptionSchema = z.object({
  label: z.string().trim().min(1, "Enter a name").max(60, "At most 60 characters").optional(),
  sortOrder: z.coerce.number().int().min(0).max(100000).optional(),
  isActive: z.boolean().optional(),
});
/** A stored option key (validated against field_options by the owning service). */
export const optionKey = (label: string) =>
  z.string({ error: `${label} is required` }).trim().min(1, `${label} is required`).max(80);
export { OPTION_FIELD_KEYS };
