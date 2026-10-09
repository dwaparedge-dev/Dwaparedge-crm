import "server-only";
import { query, type Queryable } from "@/lib/db";

/**
 * Allocates the next number for (docType, scope). Must run inside the same transaction that
 * uses the number: the upsert row-locks, so concurrent callers are serialised and a rollback
 * releases the number again.
 */
export async function nextSequence(docType: string, scope: string, tx: Queryable): Promise<number> {
  const rows = await query<{ last_value: number }>(
    `INSERT INTO document_sequences (doc_type, scope, last_value) VALUES ($1, $2, 1)
     ON CONFLICT (doc_type, scope)
     DO UPDATE SET last_value = document_sequences.last_value + 1, updated_at = now()
     RETURNING last_value`,
    [docType, scope],
    tx,
  );
  return rows[0]!.last_value;
}
