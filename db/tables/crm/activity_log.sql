-- Table: activity_log
-- Shared activity (audit) log; license history lives here too (metadata carries from/to/note/details).
CREATE TABLE IF NOT EXISTS activity_log (
  id          BIGSERIAL   PRIMARY KEY,
  entity_type TEXT        NOT NULL,
  entity_id   UUID        NOT NULL,
  client_id   UUID        REFERENCES clients(id) ON DELETE RESTRICT,  -- for the client activity tab
  action      TEXT        NOT NULL,
  summary     TEXT        NOT NULL,
  actor_id    UUID        REFERENCES users(id) ON DELETE SET NULL,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS activity_client_idx ON activity_log (client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS activity_entity_idx ON activity_log (entity_type, entity_id);
