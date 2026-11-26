import "server-only";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import type { AnalyticsBatch } from "./schema";
import { AppError } from "@/lib/auth/errors";

export interface IngestResult {
  /** Events stored now; a retried batch stores 0. */
  stored: number;
}

/**
 * Stores one batch from the website server: the visitor, the visit and its events. Safe to retry: an event id already
 * stored is skipped, so counters move only for new events. Everything is in one transaction.
 */
export async function ingestBatch(batch: AnalyticsBatch): Promise<IngestResult> {
  return db.transaction(async (tx) => {
    const first = batch.events[0]!;
    await tx.query(
      `INSERT INTO analytics_visitors (id, first_referrer_host, consent_version)
       VALUES ($1, $2, $3)
       ON CONFLICT (id) DO UPDATE SET last_seen_at = now(), consent_version = EXCLUDED.consent_version`,
      [batch.visitorId, batch.referrerHost ?? null, batch.consentVersion],
    );

    const created = await tx.query(
      `INSERT INTO analytics_sessions (id, visitor_id, entry_path, exit_path, referrer_host, utm_source, utm_medium, utm_campaign,
                                       country, region, city, device_type, browser, os, language)
       VALUES ($1, $2, $3, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [
        batch.sessionId, batch.visitorId, first.path, batch.referrerHost ?? null, batch.utmSource ?? null, batch.utmMedium ?? null,
        batch.utmCampaign ?? null, batch.country ?? null, batch.region ?? null, batch.city ?? null, batch.deviceType,
        batch.browser ?? null, batch.os ?? null, batch.language ?? null,
      ],
    );
    if (created.rowCount) {
      await tx.query("UPDATE analytics_visitors SET session_count = session_count + 1 WHERE id = $1", [batch.visitorId]);
    } else {
      // A session id that already belongs to another browser is not ours to add to.
      const { rows } = await tx.query<{ visitor_id: string }>("SELECT visitor_id FROM analytics_sessions WHERE id = $1", [batch.sessionId]);
      if (rows[0]?.visitor_id !== batch.visitorId) throw new AppError("Session belongs to another visitor", 409, "SESSION_MISMATCH");
    }

    let pageviews = 0;
    let activeS = 0;
    let custom = 0;
    let demo = false;
    let stored = 0;
    let exitPath: string | null = null;
    for (const e of batch.events) {
      const { rowCount } = await tx.query(
        `INSERT INTO analytics_events (event_id, session_id, type, name, path, duration_s, scroll_pct, occurred_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, now() - make_interval(secs => $8::double precision / 1000))
         ON CONFLICT (event_id) DO NOTHING`,
        [e.eventId, batch.sessionId, e.type, e.type === "custom" ? e.name : null, e.path, e.type === "engagement" ? (e.durationS ?? 0) : null, e.scrollPct ?? null, e.ageMs],
      );
      if (!rowCount) continue;
      stored++;
      if (e.type === "pageview") { pageviews++; exitPath = e.path; }
      else if (e.type === "engagement") activeS += e.durationS ?? 0;
      else { custom++; if (e.name === "demo_request") demo = true; }
    }

    if (stored) {
      await tx.query(
        `UPDATE analytics_sessions SET
           page_count = page_count + $2,
           active_s = LEAST(active_s + $3, 86400),
           custom_events = custom_events + $4,
           demo_requested = demo_requested OR $5,
           exit_path = COALESCE($6, exit_path),
           last_seen_at = now()
         WHERE id = $1`,
        [batch.sessionId, pageviews, activeS, custom, demo, exitPath],
      );
      if (pageviews) await tx.query("UPDATE analytics_visitors SET pageview_count = pageview_count + $2 WHERE id = $1", [batch.visitorId, pageviews]);
    }
    return { stored };
  });
}

/**
 * Right to erasure / withdrawal of consent: removes the visitor, their visits and events, and unlinks any demo request.
 * The demo request itself stays (the person asked for the demo); only the browser identifier is cut loose.
 */
export async function forgetVisitor(visitorId: string): Promise<{ removed: boolean }> {
  return db.transaction(async (tx) => {
    const { rowCount } = await tx.query("DELETE FROM analytics_visitors WHERE id = $1", [visitorId]);
    await tx.query("UPDATE demo_requests SET visitor_id = NULL WHERE visitor_id = $1", [visitorId]);
    return { removed: (rowCount ?? 0) > 0 };
  });
}

export interface PurgeResult {
  visitors: number;
  sessions: number;
}

/** Storage limitation: erases analytics older than ANALYTICS_RETENTION_DAYS. Run daily (`npm run analytics:purge`). */
export async function purgeExpiredAnalytics(days: number = getEnv().ANALYTICS_RETENTION_DAYS): Promise<PurgeResult> {
  return db.transaction(async (tx) => {
    const v = await tx.query("DELETE FROM analytics_visitors WHERE last_seen_at < now() - make_interval(days => $1)", [days]);
    const s = await tx.query("DELETE FROM analytics_sessions WHERE started_at < now() - make_interval(days => $1)", [days]);
    await tx.query("UPDATE demo_requests d SET visitor_id = NULL WHERE d.visitor_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM analytics_visitors a WHERE a.id = d.visitor_id)");
    return { visitors: v.rowCount ?? 0, sessions: s.rowCount ?? 0 };
  });
}
