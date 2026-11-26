-- Table: analytics_sessions
-- One visit: starts when a consenting browser opens the site, ends after 30 idle minutes (decided by the browser).
-- Where = country / region / city looked up from the visitor's address by the web host, which then discards the address.
CREATE TABLE IF NOT EXISTS analytics_sessions (
  id            UUID        PRIMARY KEY,            -- made up by the browser
  visitor_id    UUID        NOT NULL REFERENCES analytics_visitors(id) ON DELETE CASCADE,
  started_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  entry_path    TEXT        NOT NULL,
  exit_path     TEXT        NOT NULL,
  referrer_host TEXT,
  utm_source    TEXT,
  utm_medium    TEXT,
  utm_campaign  TEXT,
  country       TEXT,       -- ISO 3166-1 alpha-2, upper case
  region        TEXT,
  city          TEXT,
  device_type   TEXT        NOT NULL DEFAULT 'desktop' CHECK (device_type IN ('desktop','mobile','tablet')),
  browser       TEXT,
  os            TEXT,
  language      TEXT,
  page_count    INTEGER     NOT NULL DEFAULT 0 CHECK (page_count >= 0),
  active_s      INTEGER     NOT NULL DEFAULT 0 CHECK (active_s >= 0),  -- seconds the page was actually visible
  custom_events INTEGER     NOT NULL DEFAULT 0 CHECK (custom_events >= 0),  -- section views, form start, ...
  demo_requested BOOLEAN    NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS analytics_sessions_started_idx ON analytics_sessions (started_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_visitor_idx ON analytics_sessions (visitor_id, started_at DESC);
CREATE INDEX IF NOT EXISTS analytics_sessions_last_seen_idx ON analytics_sessions (last_seen_at);
