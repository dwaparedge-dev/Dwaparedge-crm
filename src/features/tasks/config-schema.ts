import { z } from "zod";
import { plainText } from "@/lib/validation";

// Input for the Settings screens that manage task categories and priorities (spec sections 6 and 10).
// The key, the system flag and the history are never taken from the caller: fields not listed here are ignored.

const name = plainText("Name", 60);

/** `#rrggbb`, kept in lower case so one colour is always spelt one way. */
const colour = z
  .string({ error: "Choose a colour" })
  .trim()
  .regex(/^#[0-9a-fA-F]{6}$/, "Use a colour like #1a2b3c")
  .transform((s) => s.toLowerCase());

/** Only the order of the pickers; for priorities the importance is `rank`. */
const sortOrder = z.number().int().min(0).max(100000);

/** The cadence copied onto new tasks of a category; blank or null means no repeat. */
const defaultFollowUpDays = z.preprocess((v) => (v === "" ? null : v), z.number().int().min(1).max(365).nullable());

/** 1 = most urgent. */
const rank = z.number().int().min(1).max(99);

const nothingToUpdate = { message: "Nothing to update" };
const hasChange = (v: Record<string, unknown>) => Object.values(v).some((x) => x !== undefined);

export const createCategorySchema = z.object({ name, colour, defaultFollowUpDays: defaultFollowUpDays.optional(), sortOrder: sortOrder.optional() });
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const createPrioritySchema = z.object({ name, colour, rank, sortOrder: sortOrder.optional() });
export type CreatePriorityInput = z.infer<typeof createPrioritySchema>;

/** Only the fields that are sent change. A new row is always active; hiding and showing is an edit. */
export const updateCategorySchema = z
  .object({ name, colour, defaultFollowUpDays, sortOrder, isActive: z.boolean() })
  .partial()
  .refine(hasChange, nothingToUpdate);
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

export const updatePrioritySchema = z
  .object({ name, colour, rank, sortOrder, isActive: z.boolean() })
  .partial()
  .refine(hasChange, nothingToUpdate);
export type UpdatePriorityInput = z.infer<typeof updatePrioritySchema>;

/** `all=true` includes hidden rows, for the Settings screens and for showing tasks that still point at a hidden row. */
export const listConfigSchema = z.object({ all: z.enum(["true", "false"]).optional() });
