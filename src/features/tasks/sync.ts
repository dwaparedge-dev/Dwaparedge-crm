import "server-only";
import type { PoolClient } from "pg";
import { db } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { logActivity } from "@/lib/activity";
import { todayIST } from "@/lib/dates";
import { SIGNAL_RULES, type SignalCandidate } from "./signals";

export interface SyncResult {
  status: "disabled" | "skipped" | "ran";
  created: number;
  closed: number;
  reopened: number;
}

/** Any fixed number: whoever holds it runs the sync, a second caller skips instead of waiting. */
const SYNC_LOCK = 724_001;

/** Creates the missing tasks (one per dedupe key, ever). Returns how many were created. Shared with the backfill command. */
export async function raiseCandidates(candidates: SignalCandidate[], tx: PoolClient): Promise<number> {
  let created = 0;
  for (const c of candidates) {
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO tasks (title, category_id, priority_id, status, owner_id, client_id, origin, source_type, source_id, dedupe_key, due_date)
       SELECT $1, (SELECT id FROM task_categories WHERE key = $2), (SELECT id FROM task_priorities WHERE key = $3), 'open', $4, $5, 'auto', $6, $7, $8, $9::date
       ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING RETURNING id`,
      [c.title, c.categoryKey, c.priorityKey, c.ownerId, c.clientId, c.sourceType, c.sourceId, c.dedupeKey, c.dueDate],
    );
    if (!rows[0]) continue;
    created++;
    await logActivity({ entityType: "task", entityId: rows[0].id, clientId: c.clientId, action: "auto_created", summary: `Raised automatically: ${c.title}`, actorId: null }, tx);
  }
  return created;
}

/** Raises, closes and reopens auto-tasks so they follow the records they came from. Safe to run at any time, from any number of tabs. */
export async function syncAutoTasks(now: Date = new Date()): Promise<SyncResult> {
  const from = getEnv().TASKS_AUTO_FROM;
  if (!from) return { status: "disabled", created: 0, closed: 0, reopened: 0 };
  const today = todayIST(now);

  return db.transaction(async (tx) => {
    const lock = await tx.query<{ ok: boolean }>("SELECT pg_try_advisory_xact_lock($1) AS ok", [SYNC_LOCK]);
    if (!lock.rows[0]?.ok) return { status: "skipped" as const, created: 0, closed: 0, reopened: 0 };

    let created = 0, closed = 0, reopened = 0;
    for (const rule of SIGNAL_RULES) {
      const holding = await rule.holds(tx, today);
      const keys = holding.map((h) => h.dedupeKey);
      created += await raiseCandidates(holding.filter((h) => h.triggerDate >= from), tx);

      // Reopen what the system closed when its cause comes back; a task a person closed is never touched.
      const back = await tx.query<{ id: string; title: string; client_id: string | null }>(
        `UPDATE tasks SET status = 'open', completed_at = NULL, completed_by = NULL, updated_at = now()
         WHERE origin = 'auto' AND source_type = $1 AND status = 'done' AND completed_by IS NULL AND dedupe_key = ANY($2::text[])
         RETURNING id, title, client_id`, [rule.sourceType, keys]);
      for (const r of back.rows) {
        reopened++;
        await logActivity({ entityType: "task", entityId: r.id, clientId: r.client_id, action: "auto_reopened", summary: `Reopened automatically: ${r.title}`, actorId: null }, tx);
      }

      // Close active auto-tasks whose cause has ended (parked and waiting ones too).
      const reason = CLOSE_REASON[rule.sourceType];
      const gone = await tx.query<{ id: string; title: string; client_id: string | null }>(
        `UPDATE tasks SET status = 'done', completed_at = now(), completed_by = NULL, updated_at = now()
         WHERE origin = 'auto' AND source_type = $1 AND status IN ('open','in_progress','waiting') AND NOT (dedupe_key = ANY($2::text[]))
         RETURNING id, title, client_id`, [rule.sourceType, keys]);
      for (const r of gone.rows) {
        closed++;
        await logActivity({ entityType: "task", entityId: r.id, clientId: r.client_id, action: "auto_closed", summary: `Closed automatically: ${reason}`, actorId: null }, tx);
      }
    }
    return { status: "ran" as const, created, closed, reopened };
  });
}

const CLOSE_REASON = {
  demo_request: "demo request is no longer new",
  invoice: "invoice is paid, cancelled or no longer overdue",
  license: "licence renewed or no longer active",
  sale_milestone: "milestone invoiced or no longer due",
} as const;
