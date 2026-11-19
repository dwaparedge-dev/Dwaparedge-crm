-- Table: task_categories
-- The founders' own list of task categories (Sales & leads, Collections, ...), managed from Settings. A row the code relies on
-- (the auto-task rules) carries a stable `key` and is_system: it can be renamed, recoloured or hidden, never deleted.
CREATE TABLE IF NOT EXISTS task_categories (
  id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key                    TEXT        NOT NULL,   -- stable slug the code refers to; never changes
  name                   TEXT        NOT NULL,   -- the label people see; can be renamed
  colour                 TEXT        NOT NULL,   -- #rrggbb, for chips on the Desk
  default_follow_up_days INTEGER     CHECK (default_follow_up_days > 0),  -- cadence copied onto new tasks; null = no repeat
  sort_order             INTEGER     NOT NULL DEFAULT 0,
  is_active              BOOLEAN     NOT NULL DEFAULT true,   -- hidden from the pickers when false
  is_system              BOOLEAN     NOT NULL DEFAULT false,  -- seeded rows the code relies on: can be renamed or hidden, never deleted
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_categories_key_key UNIQUE (key)
);
