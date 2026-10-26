import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { getEnv } from "@/lib/env";
import { AppError, unauthorized } from "./errors";

export const INTAKE_KEY_HEADER = "x-intake-key";

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Gate for machine-to-machine intake routes (the FactoOne site posting a demo request). There is no staff session
 * here, so the shared secret is the only credential. Both sides are hashed first so the comparison is constant-time
 * whatever the length of what the caller sent.
 */
export function requireIntakeKey(request: Request): void {
  const expected = getEnv().DEMO_INTAKE_KEY;
  if (!expected) throw new AppError("Intake is not configured", 503, "INTAKE_DISABLED");
  const sent = request.headers.get(INTAKE_KEY_HEADER) ?? "";
  if (!timingSafeEqual(digest(sent), digest(expected))) throw unauthorized("Invalid intake key");
}
