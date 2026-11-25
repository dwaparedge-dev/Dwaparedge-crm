-- Table: tasks
-- The Task Desk: things a person must do or chase, typed in by hand or raised automatically from a demo request, an overdue
-- invoice, an expiring licence or a milestone to bill. Tasks are never deleted; a mistaken one is cancelled.
-- Urgency (overdue, due today, ...) is derived from due_date and follow_up_at and is never stored. History is activity_log.
CREATE TABLE IF NOT EXISTS tasks (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title                TEXT        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 200),
  description          TEXT        CHECK (char_length(description) <= 5000),
  category_id          UUID        NOT NULL REFERENCES task_categories(id) ON DELETE RESTRICT,
  priority_id          UUID        NOT NULL REFERENCES task_priorities(id) ON DELETE RESTRICT,
  status               TEXT        NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','waiting','done','cancelled')),
  owner_id             UUID        REFERENCES users(id) ON DELETE SET NULL,  -- who must do it; null = Unassigned (a deactivated owner is treated as Unassigned when read)
  created_by           UUID        REFERENCES users(id) ON DELETE SET NULL,  -- null for tasks raised by the system
  client_id            UUID        REFERENCES clients(id) ON DELETE SET NULL,
  origin               TEXT        NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','auto')),
  source_type          TEXT        CHECK (source_type IN ('demo_request','invoice','license','sale_milestone')),  -- the record an auto-task came from
  source_id            UUID,       -- id of that record; set together with source_type
  dedupe_key           TEXT,       -- one task per condition, e.g. invoice_overdue:<invoice id>; unique where set
  due_date             DATE,       -- the deadline, a calendar day in Asia/Kolkata
  follow_up_at         TIMESTAMPTZ,  -- when to look at it again; a task is parked while this is in the future
  follow_up_every_days INTEGER     CHECK (follow_up_every_days > 0),  -- cadence: the next follow-up defaults to now plus this many days
  follow_up_count      INTEGER     NOT NULL DEFAULT 0 CHECK (follow_up_count >= 0),  -- follow-ups recorded so far, drives the Stuck tag
  last_followed_up_at  TIMESTAMPTZ,
  waiting_on           TEXT,       -- who or what we are waiting for
  completed_at         TIMESTAMPTZ,
  completed_by         UUID        REFERENCES users(id) ON DELETE SET NULL,  -- null with completed_at set = closed by the system
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT tasks_waiting_needs_follow_up CHECK (status <> 'waiting' OR follow_up_at IS NOT NULL),
  CONSTRAINT tasks_done_needs_completed_at CHECK (status <> 'done' OR completed_at IS NOT NULL),
  CONSTRAINT tasks_source_pair CHECK ((source_type IS NULL) = (source_id IS NULL)),
  CONSTRAINT tasks_auto_needs_key CHECK (origin <> 'auto' OR dedupe_key IS NOT NULL)
);
-- The Desk's own tasks, and the follow-ups that have come due: both only look at active tasks.
CREATE INDEX IF NOT EXISTS tasks_owner_status_due_idx ON tasks (owner_id, status, due_date) WHERE status IN ('open','in_progress','waiting');
CREATE INDEX IF NOT EXISTS tasks_follow_up_idx ON tasks (follow_up_at) WHERE status IN ('open','in_progress','waiting') AND follow_up_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS tasks_category_idx ON tasks (category_id);
CREATE INDEX IF NOT EXISTS tasks_priority_idx ON tasks (priority_id);
CREATE INDEX IF NOT EXISTS tasks_client_idx ON tasks (client_id);
CREATE INDEX IF NOT EXISTS tasks_source_idx ON tasks (source_type, source_id);
-- The sync's idempotency: running it twice, or from two tabs at once, can never create a second task for the same condition.
CREATE UNIQUE INDEX IF NOT EXISTS tasks_dedupe_key ON tasks (dedupe_key) WHERE dedupe_key IS NOT NULL;
