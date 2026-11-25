import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import type { CurrentUser } from "@/lib/auth/current-user";
import { setDemoRequestStatusIn } from "@/features/demo-requests/service";
import { lockForChange } from "./service";

/** "Mark contacted" on an auto-raised demo-request task: moves the request to Contacted and closes the task, in one transaction. */
export async function markDemoRequestTaskContacted(taskId: string, actor: CurrentUser): Promise<void> {
  await db.transaction(async (tx) => {
    const task = await lockForChange(tx, taskId, actor, "edit");
    if (task.origin !== "auto" || task.source_type !== "demo_request" || !task.source_id) {
      throw new AppError("Only a demo request task can be marked contacted", 409, "INVALID_TRANSITION");
    }
    const { rows } = await tx.query<{ status: string }>("SELECT status FROM demo_requests WHERE id = $1", [task.source_id]);
    if (rows[0]?.status === "new") await setDemoRequestStatusIn(tx, task.source_id, { status: "contacted" }, actor.id);
    if (task.status === "done" || task.status === "cancelled") return;
    await tx.query("UPDATE tasks SET status = 'done', completed_at = now(), completed_by = $2, updated_at = now() WHERE id = $1", [taskId, actor.id]);
    await logActivity({ entityType: "task", entityId: taskId, clientId: task.client_id, action: "status_changed", summary: `Marked contacted: ${task.title}`, actorId: actor.id, metadata: { from: task.status, to: "done" } }, tx);
  });
}
