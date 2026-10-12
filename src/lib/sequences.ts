import "server-only";
import { query, type Queryable } from "@/lib/db";
import { clientCodeFromIndex } from "@/lib/numbering";

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

/**
 * The client's permanent code (AA01, AA02 ...), assigned the first time it is needed. Locks the client row, so two
 * transactions cannot give the same client two codes, and runs in the caller's transaction like nextSequence.
 */
export async function ensureClientCode(clientId: string, tx: Queryable): Promise<string> {
  const row = (await query<{ code: string | null }>("SELECT code FROM clients WHERE id = $1 FOR UPDATE", [clientId], tx))[0];
  if (!row) throw new Error("Client not found");
  if (row.code) return row.code;
  const code = clientCodeFromIndex(await nextSequence("client_code", "", tx));
  await query("UPDATE clients SET code = $1 WHERE id = $2", [code, clientId], tx);
  return code;
}
