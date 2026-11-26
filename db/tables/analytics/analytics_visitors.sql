-- Table: analytics_visitors
-- One row per browser that ACCEPTED analytics on the website (opt-in; nothing is stored before consent).
-- `id` is a random value the browser made up and keeps in a first-party cookie: it identifies a browser, not a person,
-- until the visitor submits a form (then demo_requests.visitor_id links the two).
-- No IP address, no full user agent and no query string are ever stored. Deleting a row here erases that visitor's
-- sessions and events (ON DELETE CASCADE); see src/features/analytics/service.ts (forgetVisitor, purgeExpiredAnalytics).
CREATE TABLE IF NOT EXISTS analytics_visitors (
  id                  UUID        PRIMARY KEY,
  first_seen_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  session_count       INTEGER     NOT NULL DEFAULT 0 CHECK (session_count >= 0),
  pageview_count      INTEGER     NOT NULL DEFAULT 0 CHECK (pageview_count >= 0),
  first_referrer_host TEXT,       -- host only, e.g. "www.google.com"
  consent_version     TEXT        NOT NULL,   -- version of the notice the visitor accepted (proof of consent)
  consent_at          TIMESTAMPTZ NOT NULL DEFAULT now()  -- first time we received data under that consent
);
CREATE INDEX IF NOT EXISTS analytics_visitors_last_seen_idx ON analytics_visitors (last_seen_at);
