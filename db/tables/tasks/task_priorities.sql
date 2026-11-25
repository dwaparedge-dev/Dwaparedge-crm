-- Table: task_priorities
-- The founders' own list of priorities (Critical, High, Normal, Low), managed from Settings. `rank` orders tasks inside a Desk
-- section (1 = most urgent); sort_order is only the order of the pickers. Rows with is_system are relied on by the auto-task rules.
CREATE TABLE IF NOT EXISTS task_priorities (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  key        TEXT        NOT NULL,   -- stable slug the code refers to; never changes
  name       TEXT        NOT NULL,   -- the label people see; can be renamed
  colour     TEXT        NOT NULL,   -- #rrggbb, for chips on the Desk
  rank       INTEGER     NOT NULL CHECK (rank >= 1),  -- 1 = most urgent
  sort_order INTEGER     NOT NULL DEFAULT 0,
  is_active  BOOLEAN     NOT NULL DEFAULT true,   -- hidden from the pickers when false
  is_system  BOOLEAN     NOT NULL DEFAULT false,  -- starter row (added once at first setup); after that it is an ordinary row
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT task_priorities_key_key UNIQUE (key)
);
