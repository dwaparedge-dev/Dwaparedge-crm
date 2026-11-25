import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import type { CurrentUser } from "@/lib/auth/current-user";
import { formatWhen } from "./display";
import type { FollowUpInput, SnoozeInput, TaskStatus } from "./schema";
import { DAY_MS, followUpTime, invalid, lockForChange } from "./service";

// Following up and snoozing (spec section 5, "Follow-up timers"). Both lock the task, need the right to change it, refuse a
// closed task, and check every time they set against the injectable clock: in the future and at most 365 days out. A
// follow-up is counted (the count drives the Stuck tag); a snooze only moves the time. Both are logged in the same transaction.

function assertActive(status: TaskStatus) {
  if (status === "done" || status === "cancelled") throw new AppError(`This task is ${status}. Reopen it first.`, 409, "INVALID_TRANSITION");
}

/**
 * Records that the task was chased, with a note, and when to chase it next: in N days, at a time, after the task's own
 * cadence, or never (which also ends the cadence). A waiting task cannot stop: it must say when to look at it again.
 */
export async function recordFollowUp(id: string, input: FollowUpInput, actor: CurrentUser, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const cur = await lockForChange(tx, id, actor, "edit");
    assertActive(cur.status);

    const { next } = input;
    const afterDays = (days: number) => followUpTime(new Date(now.getTime() + days * DAY_MS).toISOString(), now);
    let followUpAt: string | null;
    switch (next.kind) {
      case "in_days":
        followUpAt = afterDays(next.days);
        break;
      case "at":
        followUpAt = followUpTime(next.at, now);
        break;
      case "cadence":
        if (!cur.follow_up_every_days) throw invalid("This task has no follow-up cadence. Choose when to follow up next.");
        followUpAt = afterDays(cur.follow_up_every_days);
        break;
      case "stop":
        if (cur.status === "waiting") throw invalid("A waiting task needs a follow-up time. Choose when to look at it again, or move it out of Waiting first.");
        followUpAt = null;
        break;
    }

    // The count goes up in SQL under the row lock, so two follow-ups at once both count.
    await tx.query(
      `UPDATE tasks SET follow_up_count = follow_up_count + 1, last_followed_up_at = $2, follow_up_at = $3,
              follow_up_every_days = CASE WHEN $4::boolean THEN NULL ELSE follow_up_every_days END,
              updated_at = now()
       WHERE id = $1`,
      [id, now.toISOString(), followUpAt, next.kind === "stop"],
    );
    await logActivity(
      {
        entityType: "task", entityId: id, clientId: cur.client_id, action: "followed_up",
        summary: `Followed up on "${cur.title}": ${input.note} (${followUpAt ? `next follow-up ${formatWhen(followUpAt)}` : "follow-ups stopped"})`,
        actorId: actor.id,
        // A chosen time is kept as the instant that was stored, in UTC, like every other time.
        metadata: { note: input.note, next: next.kind === "at" ? { kind: "at", at: followUpAt } : next },
      },
      tx,
    );
  });
}

/** Parks the task until a time without counting a follow-up: only the follow-up time changes. */
export async function snoozeTask(id: string, input: SnoozeInput, actor: CurrentUser, now: Date = new Date()): Promise<void> {
  await db.transaction(async (tx) => {
    const cur = await lockForChange(tx, id, actor, "edit");
    assertActive(cur.status);
    const until = followUpTime(input.until, now);

    await tx.query("UPDATE tasks SET follow_up_at = $2, updated_at = now() WHERE id = $1", [id, until]);
    await logActivity(
      {
        entityType: "task", entityId: id, clientId: cur.client_id, action: "snoozed",
        summary: `Snoozed "${cur.title}" until ${formatWhen(until)}`, actorId: actor.id, metadata: { until },
      },
      tx,
    );
  });
}
