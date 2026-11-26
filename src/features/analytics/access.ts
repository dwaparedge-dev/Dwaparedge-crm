import "server-only";
import { AppError } from "@/lib/auth/errors";
import type { CurrentUser } from "@/lib/auth/current-user";
import { hasPermission } from "@/lib/auth/permissions";
import { resolveRange, type ReportRange } from "./range";

/** Visitor data is personal data: only accounts holding analytics.view may read it, checked on every route. */
export function requireAnalyticsView(user: CurrentUser): void {
  if (!hasPermission(user.permissions, "analytics.view")) throw new AppError("You do not have permission to view website analytics", 403, "FORBIDDEN");
}

/** A bad date range is the caller's mistake: 422, not a 500. */
export function parseRange(q: { range?: string; from?: string; to?: string }): ReportRange {
  try {
    return resolveRange(q);
  } catch (e) {
    throw new AppError(e instanceof Error ? e.message : "Invalid date range", 422, "VALIDATION_ERROR");
  }
}
