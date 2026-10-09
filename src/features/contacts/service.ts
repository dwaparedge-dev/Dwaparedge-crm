import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import type { ContactInput } from "./schema";

export interface ContactRow {
  id: string;
  client_id: string;
  name: string;
  designation: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export const listContacts = (clientId: string) =>
  db.query<ContactRow>("SELECT * FROM contacts WHERE client_id = $1 ORDER BY is_primary DESC, name", [clientId]);

export async function createContact(clientId: string, input: ContactInput, actorId: string) {
  return db.transaction(async (tx) => {
    const client = await tx.query("SELECT 1 FROM clients WHERE id = $1 FOR UPDATE", [clientId]);
    if (!client.rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");

    // The first contact becomes primary automatically.
    const existing = await tx.query("SELECT 1 FROM contacts WHERE client_id = $1 LIMIT 1", [clientId]);
    const isPrimary = input.isPrimary || existing.rowCount === 0;
    if (isPrimary) await tx.query("UPDATE contacts SET is_primary = false WHERE client_id = $1 AND is_primary", [clientId]);

    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO contacts (client_id, name, designation, email, phone, notes, is_primary)
       VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
      [clientId, input.name, input.designation, input.email, input.phone, input.notes, isPrimary],
    );
    const id = rows[0]!.id;
    await logActivity({ entityType: "contact", entityId: id, clientId, action: "created", summary: `Contact "${input.name}" added`, actorId }, tx);
    return id;
  });
}

export async function updateContact(clientId: string, contactId: string, input: ContactInput, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT 1 FROM clients WHERE id = $1 FOR UPDATE", [clientId]);
    const current = await tx.query<{ is_primary: boolean }>(
      "SELECT is_primary FROM contacts WHERE id = $1 AND client_id = $2 FOR UPDATE",
      [contactId, clientId],
    );
    if (!current.rowCount) throw new AppError("Contact not found", 404, "NOT_FOUND");
    // A client keeps its primary contact unless another one is promoted.
    const isPrimary = input.isPrimary || current.rows[0]!.is_primary;
    if (isPrimary) {
      await tx.query("UPDATE contacts SET is_primary = false WHERE client_id = $1 AND is_primary AND id <> $2", [clientId, contactId]);
    }
    await tx.query(
      `UPDATE contacts SET name=$1, designation=$2, email=$3, phone=$4, notes=$5, is_primary=$6, updated_at=now()
       WHERE id = $7 AND client_id = $8`,
      [input.name, input.designation, input.email, input.phone, input.notes, isPrimary, contactId, clientId],
    );
    await logActivity({ entityType: "contact", entityId: contactId, clientId, action: "updated", summary: `Contact "${input.name}" updated`, actorId }, tx);
  });
}

export async function deleteContact(clientId: string, contactId: string, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.query("SELECT 1 FROM clients WHERE id = $1 FOR UPDATE", [clientId]);
    const { rows } = await tx.query<{ name: string; is_primary: boolean }>(
      "DELETE FROM contacts WHERE id = $1 AND client_id = $2 RETURNING name, is_primary",
      [contactId, clientId],
    );
    const removed = rows[0];
    if (!removed) throw new AppError("Contact not found", 404, "NOT_FOUND");
    if (removed.is_primary) {
      await tx.query(
        `UPDATE contacts SET is_primary = true WHERE id = (
           SELECT id FROM contacts WHERE client_id = $1 ORDER BY created_at LIMIT 1)`,
        [clientId],
      );
    }
    await logActivity({ entityType: "contact", entityId: contactId, clientId, action: "deleted", summary: `Contact "${removed.name}" removed`, actorId }, tx);
  });
}
