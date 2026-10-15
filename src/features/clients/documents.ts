import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import { AppError } from "@/lib/auth/errors";
import { DOC_MAX_BYTES, DOC_MIME_BY_EXT, fileExtension, type DocumentMeta } from "./schema";

export interface ClientDocumentRow {
  id: string;
  client_id: string;
  doc_name: string;
  doc_type: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  created_at: string;
}

// Never SELECT content here: a list must not pull every file out of the database.
const COLS = "id, client_id, doc_name, doc_type, file_name, mime_type, size_bytes, created_at";

export const listDocuments = (clientId: string) =>
  db.query<ClientDocumentRow>(`SELECT ${COLS} FROM client_documents WHERE client_id = $1 ORDER BY created_at, id`, [clientId]);

/** Checks the upload and returns the bytes with the MIME type taken from the extension (never from the browser). */
export async function readUpload(file: File) {
  const ext = fileExtension(file.name);
  if (!(ext in DOC_MIME_BY_EXT)) {
    throw new AppError("Upload a PDF, image (PNG, JPG, WEBP), Word or Excel file", 422, "VALIDATION_ERROR");
  }
  if (file.size === 0) throw new AppError("The file is empty", 422, "VALIDATION_ERROR");
  if (file.size > DOC_MAX_BYTES) throw new AppError("The file is larger than 4 MB", 413, "FILE_TOO_LARGE");
  return {
    bytes: Buffer.from(await file.arrayBuffer()),
    fileName: file.name.slice(-200),
    mimeType: DOC_MIME_BY_EXT[ext as keyof typeof DOC_MIME_BY_EXT],
  };
}

export async function addDocument(clientId: string, meta: DocumentMeta, upload: Awaited<ReturnType<typeof readUpload>>, actorId: string) {
  return db.transaction(async (tx) => {
    const client = await tx.query("SELECT 1 FROM clients WHERE id = $1 FOR UPDATE", [clientId]);
    if (!client.rowCount) throw new AppError("Client not found", 404, "NOT_FOUND");
    const { rows } = await tx.query<{ id: string }>(
      `INSERT INTO client_documents (client_id, doc_name, doc_type, file_name, mime_type, size_bytes, content, uploaded_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
      [clientId, meta.docName, meta.docType, upload.fileName, upload.mimeType, upload.bytes.length, upload.bytes, actorId],
    );
    const id = rows[0]!.id;
    await logActivity({ entityType: "document", entityId: id, clientId, action: "created", summary: `Document "${meta.docName}" uploaded`, actorId }, tx);
    return id;
  });
}

export async function updateDocument(clientId: string, id: string, meta: DocumentMeta, actorId: string) {
  await db.transaction(async (tx) => {
    const { rowCount } = await tx.query(
      "UPDATE client_documents SET doc_name = $1, doc_type = $2, updated_at = now() WHERE id = $3 AND client_id = $4",
      [meta.docName, meta.docType, id, clientId],
    );
    if (!rowCount) throw new AppError("Document not found", 404, "NOT_FOUND");
    await logActivity({ entityType: "document", entityId: id, clientId, action: "updated", summary: `Document "${meta.docName}" updated`, actorId }, tx);
  });
}

export async function deleteDocument(clientId: string, id: string, actorId: string) {
  await db.transaction(async (tx) => {
    const { rows } = await tx.query<{ doc_name: string }>(
      "DELETE FROM client_documents WHERE id = $1 AND client_id = $2 RETURNING doc_name",
      [id, clientId],
    );
    if (!rows[0]) throw new AppError("Document not found", 404, "NOT_FOUND");
    await logActivity({ entityType: "document", entityId: id, clientId, action: "deleted", summary: `Document "${rows[0].doc_name}" removed`, actorId }, tx);
  });
}

export async function getDocumentFile(clientId: string, id: string) {
  const row = await db.queryOne<{ file_name: string; mime_type: string; content: Buffer }>(
    "SELECT file_name, mime_type, content FROM client_documents WHERE id = $1 AND client_id = $2",
    [id, clientId],
  );
  if (!row) throw new AppError("Document not found", 404, "NOT_FOUND");
  return row;
}
