import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  RATE_LIMIT_SALT: z.string().min(8).default("dev-rate-limit-salt"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
});

let cached: z.infer<typeof schema> | undefined;

export function getEnv() {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n${issues.join("\n")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
