-- Table: client_documents
CREATE TABLE IF NOT EXISTS client_documents (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   UUID        NOT NULL REFERENCES clients(id) ON DELETE RESTRICT,
  doc_name    TEXT        NOT NULL,
  doc_type    TEXT        NOT NULL,   -- a field_options key (client_documents.doc_type)
  file_name   TEXT        NOT NULL,   -- original name, used for the download
  mime_type   TEXT        NOT NULL,
  size_bytes  INTEGER     NOT NULL,
  content     BYTEA       NOT NULL,   -- the file itself; never selected by list queries
  uploaded_by UUID        REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS client_documents_client_idx ON client_documents (client_id);
