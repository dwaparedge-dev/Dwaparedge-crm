import { daysUntil } from "@/lib/dates";

export type StoredStatus = "pending" | "active" | "suspended" | "revoked";
export type EffectiveStatus = StoredStatus | "expired";

/** An active license past its expiry date is "expired"; everything else is its stored status. */
export function effectiveStatus(status: StoredStatus, expiryDate: string, today?: string): EffectiveStatus {
  return status === "active" && daysUntil(expiryDate, today) < 0 ? "expired" : status;
}

/** SQL twin of effectiveStatus(), kept next to it so the two cannot drift apart. */
export const TODAY_SQL = "(now() AT TIME ZONE 'Asia/Kolkata')::date";
export const EFFECTIVE_STATUS_SQL = `CASE WHEN l.status = 'active' AND l.expiry_date < ${TODAY_SQL} THEN 'expired' ELSE l.status END`;
