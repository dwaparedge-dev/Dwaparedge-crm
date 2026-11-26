import "server-only";
import type { QueryResultRow } from "pg";
import { db } from "@/lib/db";
import { AppError } from "@/lib/auth/errors";
import { CHANNELS, classifyChannel, type Channel } from "./channels";
import { eachDay, REPORT_TZ, type ReportRange } from "./range";

// Every query below filters by IST calendar days: $1 = first day, $2 = last day (inclusive).
const bounds = (col: string) => `${col} >= $1::date::timestamp AT TIME ZONE '${REPORT_TZ}' AND ${col} < ($2::date + 1)::timestamp AT TIME ZONE '${REPORT_TZ}'`;
const ENGAGED = "(page_count >= 2 OR active_s >= 10 OR custom_events > 0)";
/** Optional country / device filter. $3 and $4 are always passed (null = no filter), so the SQL text never changes. `a` is the sessions alias, e.g. "s.". */
const FILTER = (a = "") => `AND ($3::text IS NULL OR ${a}country = $3) AND ($4::text IS NULL OR ${a}device_type = $4) AND ($5::text IS NULL OR ${a}region = $5) AND ($6::text IS NULL OR ${a}city = $6)`;

export interface ReportFilters { country?: string; device?: string; region?: string; city?: string }
const params = (r: { from: string; to: string }, f: ReportFilters) => [r.from, r.to, f.country ?? null, f.device ?? null, f.region ?? null, f.city ?? null];

export interface Kpis {
  visitors: number;
  newVisitors: number;
  sessions: number;
  pageviews: number;
  avgActiveSeconds: number;
  /** 0..1 */
  engagedRate: number;
  bounceRate: number;
  demoRequests: number;
  /** Visits that ended in a demo request / all visits, 0..1. */
  conversionRate: number;
}
export interface Count { label: string; sessions: number; visitors: number }
/** One place. Parts the visitor's host could not work out are null (shown as "not available"). */
export interface GeoRow { country: string | null; region: string | null; city: string | null; sessions: number; visitors: number; demoRequests: number }
export interface Overview {
  range: ReportRange;
  /** When this report was computed (ISO). */
  generatedAt: string;
  filters: { country: string | null; device: string | null; region: string | null; city: string | null };
  /** Countries seen in this period, regardless of the country filter, for the filter's dropdown. */
  options: { countries: string[] };
  /** When data last arrived and how much came in the last 24 h: a silent tracker shows up here first. */
  health: { lastEventAt: string | null; events24h: number };
  /** Visitors per day of the previous period, in the same order as `daily`. */
  previousVisitors: number[];
  live: number;
  kpis: Kpis;
  previous: Kpis;
  daily: { date: string; visitors: number; sessions: number; pageviews: number }[];
  topPages: { path: string; views: number; visitors: number }[];
  entryPages: { path: string; sessions: number }[];
  sections: { name: string; sessions: number }[];
  channels: { channel: Channel; sessions: number; visitors: number; demoRequests: number }[];
  referrers: { host: string; sessions: number }[];
  campaigns: { campaign: string; source: string; medium: string; sessions: number; demoRequests: number }[];
  countries: Count[];
  regions: GeoRow[];
  cities: GeoRow[];
  devices: Count[];
  browsers: Count[];
  os: Count[];
  funnel: { sessions: number; engaged: number; reachedContact: number; startedForm: number; requestedDemo: number };
}

async function kpis(q: Q, range: { from: string; to: string }, f: ReportFilters): Promise<Kpis> {
  const p = params(range, f);
  const filtered = Boolean(f.country || f.device || f.region || f.city);
  const [s, nv, dr] = await Promise.all([
    q<{ sessions: number; visitors: number; pageviews: number; avg_active: number; engaged: number; converted: number }>(
      `SELECT count(*)::int AS sessions, count(DISTINCT visitor_id)::int AS visitors, COALESCE(sum(page_count), 0)::int AS pageviews,
              COALESCE(avg(active_s), 0)::float AS avg_active,
              count(*) FILTER (WHERE ${ENGAGED})::int AS engaged, count(*) FILTER (WHERE demo_requested)::int AS converted
       FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()}`, p),
    q<{ n: number }>(`SELECT count(DISTINCT s.visitor_id)::int AS n FROM analytics_sessions s JOIN analytics_visitors v ON v.id = s.visitor_id
       WHERE ${bounds("s.started_at")} AND ${bounds("v.first_seen_at")} ${FILTER("s.")}`, p),
    // Leads have no location or device, so under a filter we count visits that ended in a demo request instead.
    filtered ? Promise.resolve([{ n: 0 }]) : q<{ n: number }>(`SELECT count(*)::int AS n FROM demo_requests WHERE status <> 'spam' AND ${bounds("created_at")}`, p.slice(0, 2)),
  ]);
  const r = s[0]!;
  const ratio = (a: number, b: number) => (b ? a / b : 0);
  return {
    visitors: r.visitors, newVisitors: nv[0]!.n, sessions: r.sessions, pageviews: r.pageviews,
    avgActiveSeconds: Math.round(r.avg_active), engagedRate: ratio(r.engaged, r.sessions), bounceRate: r.sessions ? 1 - ratio(r.engaged, r.sessions) : 0,
    demoRequests: filtered ? r.converted : dr[0]!.n, conversionRate: ratio(r.converted, r.sessions),
  };
}

type Q = <T extends QueryResultRow>(sql: string, params?: unknown[]) => Promise<T[]>;

const top = (label: string, col: string, extra = "") =>
  `SELECT COALESCE(NULLIF(${col}, ''), '${label}') AS label, count(*)::int AS sessions, count(DISTINCT visitor_id)::int AS visitors
   FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} ${extra} GROUP BY 1 ORDER BY sessions DESC, label LIMIT 15`;

export async function getOverview(range: ReportRange, filters: ReportFilters = {}): Promise<Overview> {
  // All of the report's queries share ONE database connection (they queue on it). Run in parallel on the pool they would need
  // ~10 connections at once, which exhausts a pooler limited to 15 clients (Supabase session mode) and breaks the other pages.
  // One connection can only run one query at a time (sending several at once is deprecated in pg), so they are queued.
  return db.transaction((c) => {
    let tail: Promise<unknown> = Promise.resolve();
    const q: Q = <T extends QueryResultRow>(sql: string, vals?: unknown[]) => {
      const run = tail.then(() => db.query<T>(sql, vals, c));
      tail = run.catch(() => undefined);
      return run;
    };
    return buildOverview(q, range, filters);
  });
}

async function buildOverview(q: Q, range: ReportRange, flt: ReportFilters): Promise<Overview> {
  const p = params(range, flt);
  const pPrev = params({ from: range.prevFrom, to: range.prevTo }, flt);
  const [k, prev, live, daily, dailyPrev, health, countryOptions, pages, entry, sections, sources, geoC, geoR, geoCity, devices, browsers, os, funnel] = await Promise.all([
    kpis(q, range, flt),
    kpis(q, { from: range.prevFrom, to: range.prevTo }, flt),
    q<{ n: number }>("SELECT count(DISTINCT visitor_id)::int AS n FROM analytics_sessions WHERE last_seen_at > now() - interval '5 minutes'"),
    q<{ d: string; visitors: number; sessions: number; pageviews: number }>(
      `SELECT to_char((started_at AT TIME ZONE '${REPORT_TZ}')::date, 'YYYY-MM-DD') AS d, count(DISTINCT visitor_id)::int AS visitors,
              count(*)::int AS sessions, COALESCE(sum(page_count), 0)::int AS pageviews
       FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} GROUP BY 1`, p),
    q<{ d: string; visitors: number }>(
      `SELECT to_char((started_at AT TIME ZONE '${REPORT_TZ}')::date, 'YYYY-MM-DD') AS d, count(DISTINCT visitor_id)::int AS visitors
       FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} GROUP BY 1`, pPrev),
    q<{ last_at: string | null; n: number }>(
      `SELECT max(occurred_at) AS last_at, count(*) FILTER (WHERE occurred_at > now() - interval '24 hours')::int AS n FROM analytics_events`),
    q<{ country: string }>(
      `SELECT DISTINCT country FROM analytics_sessions WHERE ${bounds("started_at")} AND country IS NOT NULL ORDER BY 1`, p.slice(0, 2)),
    q<{ path: string; views: number; visitors: number }>(
      `SELECT e.path, count(*)::int AS views, count(DISTINCT s.visitor_id)::int AS visitors
       FROM analytics_events e JOIN analytics_sessions s ON s.id = e.session_id
       WHERE e.type = 'pageview' AND ${bounds("e.occurred_at")} ${FILTER("s.")} GROUP BY e.path ORDER BY views DESC, e.path LIMIT 15`, p),
    q<{ path: string; sessions: number }>(
      `SELECT entry_path AS path, count(*)::int AS sessions FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} GROUP BY 1 ORDER BY sessions DESC, 1 LIMIT 15`, p),
    q<{ name: string; sessions: number }>(
      `SELECT e.name, count(DISTINCT e.session_id)::int AS sessions FROM analytics_events e JOIN analytics_sessions s ON s.id = e.session_id
       WHERE e.type = 'custom' AND e.name LIKE 'section\\_%' AND ${bounds("e.occurred_at")} ${FILTER("s.")} GROUP BY e.name ORDER BY sessions DESC`, p),
    q<{ referrer_host: string | null; utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; sessions: number; visitors: number; converted: number }>(
      `SELECT referrer_host, utm_source, utm_medium, utm_campaign, count(*)::int AS sessions, count(DISTINCT visitor_id)::int AS visitors,
              count(*) FILTER (WHERE demo_requested)::int AS converted
       FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} GROUP BY 1, 2, 3, 4`, p),
    q<Count>(top("Unknown", "country"), p),
    q<GeoRow>(`SELECT country, NULLIF(region, '') AS region, NULL::text AS city, count(*)::int AS sessions, count(DISTINCT visitor_id)::int AS visitors,
              count(*) FILTER (WHERE demo_requested)::int AS "demoRequests"
       FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} GROUP BY country, NULLIF(region, '') ORDER BY sessions DESC, region NULLS LAST LIMIT 50`, p),
    q<GeoRow>(`SELECT country, NULLIF(region, '') AS region, NULLIF(city, '') AS city, count(*)::int AS sessions, count(DISTINCT visitor_id)::int AS visitors,
              count(*) FILTER (WHERE demo_requested)::int AS "demoRequests"
       FROM analytics_sessions WHERE ${bounds("started_at")} ${FILTER()} GROUP BY country, NULLIF(region, ''), NULLIF(city, '') ORDER BY sessions DESC, city NULLS LAST LIMIT 100`, p),
    q<Count>(top("Unknown", "device_type"), p),
    q<Count>(top("Unknown", "browser"), p),
    q<Count>(top("Unknown", "os"), p),
    q<{ sessions: number; engaged: number; reached: number; started: number; requested: number }>(
      `SELECT count(*)::int AS sessions, count(*) FILTER (WHERE ${ENGAGED})::int AS engaged,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.session_id = s.id AND e.name = 'section_contact'))::int AS reached,
              count(*) FILTER (WHERE EXISTS (SELECT 1 FROM analytics_events e WHERE e.session_id = s.id AND e.name = 'form_start'))::int AS started,
              count(*) FILTER (WHERE demo_requested)::int AS requested
       FROM analytics_sessions s WHERE ${bounds("started_at")} ${FILTER("s.")}`, p),
  ]);

  const byDay = new Map(daily.map((r) => [r.d, r]));
  const prevByDay = new Map(dailyPrev.map((r) => [r.d, r]));
  const channelMap = new Map<Channel, { sessions: number; visitors: number; demoRequests: number }>(CHANNELS.map((c) => [c, { sessions: 0, visitors: 0, demoRequests: 0 }]));
  const referrerMap = new Map<string, number>();
  const campaignMap = new Map<string, { campaign: string; source: string; medium: string; sessions: number; demoRequests: number }>();
  for (const r of sources) {
    const c = channelMap.get(classifyChannel({ referrerHost: r.referrer_host, utmMedium: r.utm_medium, utmSource: r.utm_source }))!;
    c.sessions += r.sessions; c.visitors += r.visitors; c.demoRequests += r.converted;
    if (r.referrer_host) referrerMap.set(r.referrer_host, (referrerMap.get(r.referrer_host) ?? 0) + r.sessions);
    if (r.utm_campaign) {
      const key = `${r.utm_campaign}|${r.utm_source ?? ""}|${r.utm_medium ?? ""}`;
      const cur = campaignMap.get(key) ?? { campaign: r.utm_campaign, source: r.utm_source ?? "", medium: r.utm_medium ?? "", sessions: 0, demoRequests: 0 };
      cur.sessions += r.sessions; cur.demoRequests += r.converted;
      campaignMap.set(key, cur);
    }
  }
  const f = funnel[0]!;
  return {
    range, generatedAt: new Date().toISOString(), live: live[0]!.n, kpis: k, previous: prev,
    filters: { country: flt.country ?? null, device: flt.device ?? null, region: flt.region ?? null, city: flt.city ?? null },
    options: { countries: countryOptions.map((r) => r.country) },
    health: { lastEventAt: health[0]!.last_at, events24h: health[0]!.n },
    previousVisitors: eachDay(range.prevFrom, range.prevTo).map((d) => prevByDay.get(d)?.visitors ?? 0),
    daily: eachDay(range.from, range.to).map((date) => ({ date, visitors: byDay.get(date)?.visitors ?? 0, sessions: byDay.get(date)?.sessions ?? 0, pageviews: byDay.get(date)?.pageviews ?? 0 })),
    topPages: pages, entryPages: entry, sections,
    channels: [...channelMap].map(([channel, v]) => ({ channel, ...v })).filter((c) => c.sessions > 0).sort((a, b) => b.sessions - a.sessions),
    referrers: [...referrerMap].map(([host, sessions]) => ({ host, sessions })).sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    campaigns: [...campaignMap.values()].sort((a, b) => b.sessions - a.sessions).slice(0, 15),
    countries: geoC, regions: geoR, cities: geoCity, devices, browsers, os,
    funnel: { sessions: f.sessions, engaged: f.engaged, reachedContact: f.reached, startedForm: f.started, requestedDemo: f.requested },
  };
}

// ---- Visits list and the journey of one lead ----

export interface SessionRow {
  id: string;
  started_at: string;
  country: string | null;
  region: string | null;
  city: string | null;
  device_type: string;
  browser: string | null;
  os: string | null;
  channel: Channel;
  referrer_host: string | null;
  utm_campaign: string | null;
  entry_path: string;
  exit_path: string;
  page_count: number;
  active_s: number;
  demo_requested: boolean;
  /** The demo request this browser later became, if any. */
  lead_id: string | null;
  lead_company: string | null;
}

export async function listSessions(range: ReportRange, opts: { page: number; pageSize: number; only?: "identified" | "converted"; filters?: ReportFilters }): Promise<{ items: SessionRow[]; total: number }> {
  const where = `${bounds("s.started_at")} ${FILTER("s.")} ${opts.only === "identified" ? "AND lead.id IS NOT NULL" : opts.only === "converted" ? "AND s.demo_requested" : ""}`;
  const from = `FROM analytics_sessions s LEFT JOIN LATERAL (SELECT d.id, d.company FROM demo_requests d WHERE d.visitor_id = s.visitor_id ORDER BY d.created_at LIMIT 1) lead ON true`;
  const p = params(range, opts.filters ?? {});
  const [rows, total] = await Promise.all([
    db.query<Omit<SessionRow, "channel"> & { utm_medium: string | null; utm_source: string | null }>(
      `SELECT s.id, s.started_at, s.country, s.region, s.city, s.device_type, s.browser, s.os, s.referrer_host, s.utm_source, s.utm_medium, s.utm_campaign,
              s.entry_path, s.exit_path, s.page_count, s.active_s, s.demo_requested, lead.id AS lead_id, lead.company AS lead_company
       ${from} WHERE ${where} ORDER BY s.started_at DESC LIMIT $7 OFFSET $8`, [...p, opts.pageSize, (opts.page - 1) * opts.pageSize]),
    db.query<{ n: number }>(`SELECT count(*)::int AS n ${from} WHERE ${where}`, p),
  ]);
  return {
    items: rows.map(({ utm_medium, utm_source, ...r }) => ({ ...r, channel: classifyChannel({ referrerHost: r.referrer_host, utmMedium: utm_medium, utmSource: utm_source }) })),
    total: total[0]!.n,
  };
}

export interface Journey {
  linked: boolean;
  visitor: { first_seen_at: string; last_seen_at: string; session_count: number; pageview_count: number; first_referrer_host: string | null } | null;
  sessions: (Omit<SessionRow, "lead_id" | "lead_company"> & { events: { type: string; name: string | null; path: string; duration_s: number | null; scroll_pct: number | null; occurred_at: string }[] })[];
}

/** What the browser behind a demo request did on the site. Empty (not an error) when the visitor never accepted analytics. */
export async function getJourney(demoRequestId: string): Promise<Journey> {
  const link = await db.queryOne<{ visitor_id: string | null }>("SELECT visitor_id FROM demo_requests WHERE id = $1", [demoRequestId]);
  if (!link) throw new AppError("Demo request not found", 404, "NOT_FOUND");
  if (!link.visitor_id) return { linked: false, visitor: null, sessions: [] };
  const visitor = await db.queryOne<NonNullable<Journey["visitor"]>>(
    "SELECT first_seen_at, last_seen_at, session_count, pageview_count, first_referrer_host FROM analytics_visitors WHERE id = $1", [link.visitor_id]);
  if (!visitor) return { linked: false, visitor: null, sessions: [] };
  const sessions = await db.query<Omit<SessionRow, "channel" | "lead_id" | "lead_company"> & { utm_medium: string | null; utm_source: string | null }>(
    `SELECT id, started_at, country, region, city, device_type, browser, os, referrer_host, utm_source, utm_medium, utm_campaign, entry_path, exit_path, page_count, active_s, demo_requested
     FROM analytics_sessions WHERE visitor_id = $1 ORDER BY started_at DESC LIMIT 20`, [link.visitor_id]);
  const events = sessions.length
    ? await db.query<{ session_id: string; type: string; name: string | null; path: string; duration_s: number | null; scroll_pct: number | null; occurred_at: string }>(
        `SELECT session_id, type, name, path, duration_s, scroll_pct, occurred_at FROM analytics_events
         WHERE session_id = ANY($1::uuid[]) AND (type <> 'engagement' OR duration_s >= 1) ORDER BY occurred_at LIMIT 600`, [sessions.map((s) => s.id)])
    : [];
  return {
    linked: true,
    visitor,
    sessions: sessions.map(({ utm_medium, utm_source, ...s }) => ({
      ...s,
      channel: classifyChannel({ referrerHost: s.referrer_host, utmMedium: utm_medium, utmSource: utm_source }),
      events: events.filter((e) => e.session_id === s.id).map((e) => ({ type: e.type, name: e.name, path: e.path, duration_s: e.duration_s, scroll_pct: e.scroll_pct, occurred_at: e.occurred_at })),
    })),
  };
}
