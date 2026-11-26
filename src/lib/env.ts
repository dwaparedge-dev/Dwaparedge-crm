import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),
  JWT_EXPIRES_IN_DAYS: z.coerce.number().int().positive().default(7),
  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(15).default(12),
  // No fallback in production: a known salt would make the hashed login-attempt keys guessable.
  RATE_LIMIT_SALT: process.env.NODE_ENV === "production" ? z.string().min(16, "RATE_LIMIT_SALT must be set (16+ characters)") : z.string().min(8).default("dev-rate-limit-salt"),
  NEXT_PUBLIC_APP_URL: z.string().url().default("http://localhost:3000"),
  // Shared secret the FactoOne site sends with each demo request. Blank or unset = the intake endpoint answers 503.
  DEMO_INTAKE_KEY: z.preprocess((v) => (v === "" ? undefined : v), z.string().min(32, "DEMO_INTAKE_KEY must be at least 32 characters").optional()),
  // How long website analytics are kept before they are erased. 395 days = 13 months, the usual ceiling regulators accept for analytics.
  ANALYTICS_RETENTION_DAYS: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(30).max(1095).default(395)),
  // Most connections one server instance may hold open. Default 10. Keep (instances x this) under the database pooler's limit:
  // the Supabase session pooler allows only 15 in total, the transaction pooler (port 6543) allows far more. Blank = default.
  DB_POOL_MAX: z.preprocess((v) => (v === "" ? undefined : v), z.coerce.number().int().min(1).max(20).default(10)),
  // Auto-raised tasks stay off until this date (YYYY-MM-DD) is set; only records dated on or after it get a task (older ones go through `npm run tasks:backfill`).
  TASKS_AUTO_FROM: z.preprocess((v) => (v === "" ? undefined : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "TASKS_AUTO_FROM must be YYYY-MM-DD").optional()),
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
