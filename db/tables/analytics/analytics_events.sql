-- Table: analytics_events
-- Append-only. One row per page view, per "time on page" report, and per named action (section_about, form_start, demo_request).
-- Only the path is stored (never the query string, which can carry emails or tokens) and there is no free-form payload.
CREATE TABLE IF NOT EXISTS analytics_events (
  id          BIGINT      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_id    UUID        NOT NULL,                 -- made up by the browser; a retried send is stored once
  session_id  UUID        NOT NULL REFERENCES analytics_sessions(id) ON DELETE CASCADE,
  type        TEXT        NOT NULL CHECK (type IN ('pageview','engagement','custom')),
  name        TEXT,       -- custom events only
  path        TEXT        NOT NULL,
  duration_s  INTEGER     CHECK (duration_s IS NULL OR duration_s >= 0),   -- engagement: seconds visible on this page
  scroll_pct  SMALLINT    CHECK (scroll_pct IS NULL OR scroll_pct BETWEEN 0 AND 100),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS analytics_events_event_id_key ON analytics_events (event_id);
CREATE INDEX IF NOT EXISTS analytics_events_session_idx ON analytics_events (session_id, occurred_at);
CREATE INDEX IF NOT EXISTS analytics_events_type_time_idx ON analytics_events (type, occurred_at DESC);
