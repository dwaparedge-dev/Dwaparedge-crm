import { z } from "zod";
import { optionalEmail, optionalPhone, optionalText, requiredText } from "@/lib/validation";

export const contactInputSchema = z
  .object({
    name: requiredText("Name"),
    designation: optionalText(100),
    email: optionalEmail,
    phone: optionalPhone,
    notes: optionalText(2000),
    isPrimary: z.boolean().default(false),
  })
  .refine((c) => c.email || c.phone, { message: "Provide an email or a phone number", path: ["email"] });
export type ContactInput = z.infer<typeof contactInputSchema>;
