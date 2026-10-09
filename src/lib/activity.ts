import "server-only";
import { query, type Queryable } from "@/lib/db";

export interface ActivityInput {
  entityType: string;
  entityId: string;
  clientId?: string | null;
  action: string;
  summary: string;
  actorId: string | null;
  metadata?: Record<string, unknown>;
}

/** Pass the transaction client so the audit row commits or rolls back with the change. */
export async function logActivity(input: ActivityInput, client?: Queryable): Promise<void> {
  await query(
    `INSERT INTO activity_log (entity_type, entity_id, client_id, action, summary, actor_id, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [
      input.entityType,
      input.entityId,
      input.clientId ?? null,
      input.action,
      input.summary,
      input.actorId,
      input.metadata ? JSON.stringify(input.metadata) : null,
    ],
    client,
  );
}
