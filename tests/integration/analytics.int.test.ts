import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { CurrentUser } from "@/lib/auth/current-user";
import { createTestDb, expectAppError, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let admin: CurrentUser;

beforeAll(async () => {
  process.env.TASKS_AUTO_FROM = "2000-01-01";
  tdb = await createTestDb();
  const a = await makeUser("Admin");
  admin = { id: a.id, name: "Admin", email: a.email, permissions: ["demo_requests.delete", "analytics.view"] };
});
afterAll(async () => tdb?.drop());

const batch = (over: Record<string, unknown> = {}, events?: Record<string, unknown>[]) => ({
  visitorId: randomUUID(), sessionId: randomUUID(), consentVersion: "2026-11-26", country: "IN", region: "Gujarat", city: "Ahmedabad",
  deviceType: "desktop", browser: "Chrome", os: "macOS", referrerHost: "www.linkedin.com", utmCampaign: "launch",
  events: events ?? [{ eventId: randomUUID(), type: "pageview", path: "/" }], ...over,
});

async function send(b: ReturnType<typeof batch>) {
  const { analyticsBatchSchema } = await import("@/features/analytics/schema");
  const { ingestBatch } = await import("@/features/analytics/service");
  return ingestBatch(analyticsBatchSchema.parse(b));
}
async function one<T>(sql: string, p: unknown[] = []) {
  const { db } = await import("@/lib/db");
  return (await db.query<T & Record<string, unknown>>(sql, p))[0]!;
}

describe("ingesting events", () => {
  it("creates the visitor, the visit and its events, and counts the page view", async () => {
    const b = batch();
    expect(await send(b)).toEqual({ stored: 1 });
    expect(await one("SELECT session_count, pageview_count, consent_version, first_referrer_host FROM analytics_visitors WHERE id = $1", [b.visitorId])).toMatchObject({ session_count: 1, pageview_count: 1, consent_version: "2026-11-26", first_referrer_host: "www.linkedin.com" });
    expect(await one("SELECT entry_path, exit_path, page_count, country, city, utm_campaign FROM analytics_sessions WHERE id = $1", [b.sessionId])).toMatchObject({ entry_path: "/", page_count: 1, country: "IN", city: "Ahmedabad", utm_campaign: "launch" });
  });

  it("stores a retried batch once and does not double the counters", async () => {
    const b = batch();
    await send(b);
    expect(await send(b)).toEqual({ stored: 0 });
    expect(await one("SELECT page_count FROM analytics_sessions WHERE id = $1", [b.sessionId])).toMatchObject({ page_count: 1 });
    expect(await one("SELECT session_count, pageview_count FROM analytics_visitors WHERE id = $1", [b.visitorId])).toMatchObject({ session_count: 1, pageview_count: 1 });
  });

  it("adds later events to the same visit: time on page, scroll, section views, and the demo request flag", async () => {
    const b = batch();
    await send(b);
    const more = { ...b, events: [
      { eventId: randomUUID(), type: "pageview", path: "/setup" },
      { eventId: randomUUID(), type: "engagement", path: "/", durationS: 42, scrollPct: 80 },
      { eventId: randomUUID(), type: "custom", name: "section_contact", path: "/" },
      { eventId: randomUUID(), type: "custom", name: "demo_request", path: "/" },
    ] };
    expect(await send(more)).toEqual({ stored: 4 });
    expect(await one("SELECT page_count, active_s, custom_events, demo_requested, exit_path FROM analytics_sessions WHERE id = $1", [b.sessionId])).toMatchObject({ page_count: 2, active_s: 42, custom_events: 2, demo_requested: true, exit_path: "/setup" });
  });

  it("counts a second visit by the same browser on the same visitor", async () => {
    const first = batch();
    await send(first);
    await send({ ...first, sessionId: randomUUID(), events: [{ eventId: randomUUID(), type: "pageview", path: "/" }] });
    expect(await one("SELECT session_count, pageview_count FROM analytics_visitors WHERE id = $1", [first.visitorId])).toMatchObject({ session_count: 2, pageview_count: 2 });
  });

  it("refuses to add events to a visit that belongs to another browser", async () => {
    const mine = batch();
    await send(mine);
    await expectAppError(send({ ...mine, visitorId: randomUUID() }), 409, "SESSION_MISMATCH");
  });

  it("takes event time from the server clock minus the reported age, never from the visitor's clock", async () => {
    const b = batch({}, [{ eventId: randomUUID(), type: "pageview", path: "/", ageMs: 60_000 }]);
    await send(b);
    const r = await one<{ secs: number }>("SELECT extract(epoch FROM now() - occurred_at)::float AS secs FROM analytics_events WHERE session_id = $1", [b.sessionId]);
    expect(r.secs).toBeGreaterThan(55);
    expect(r.secs).toBeLessThan(120);
  });
});

describe("report filters, comparison and health", () => {
  it("narrows every figure to one country and one device, lists the countries, and compares with the previous period", async () => {
    const { getOverview, listSessions } = await import("@/features/analytics/reports");
    const { resolveRange } = await import("@/features/analytics/range");
    const mine = batch({ country: "DE", region: "Bavaria", city: "Munich", deviceType: "tablet" });
    await send(mine);
    await send(batch({ country: "IN", deviceType: "mobile" }));
    const range = resolveRange({ range: "today" });

    const de = await getOverview(range, { country: "DE" });
    expect(de.filters).toEqual({ country: "DE", device: null, region: null, city: null });
    expect(de.kpis.sessions).toBeGreaterThanOrEqual(1);
    expect(de.countries.map((c) => c.label)).toEqual(["DE"]);
    expect(de.options.countries).toEqual(expect.arrayContaining(["DE", "IN"])); // the dropdown still offers the other countries

    const both = await getOverview(range, { country: "DE", device: "mobile" });
    expect(both.kpis.sessions).toBe(0); // no German mobile visit exists
    expect(both.daily.every((d) => d.sessions === 0)).toBe(true);

    const all = await getOverview(range, {});
    expect(all.kpis.sessions).toBeGreaterThan(de.kpis.sessions);
    expect(all.previousVisitors).toHaveLength(all.daily.length);

    const list = await listSessions(range, { page: 1, pageSize: 50, filters: { device: "tablet" } });
    expect(list.items.length).toBeGreaterThanOrEqual(1);
    expect(list.items.every((s) => s.device_type === "tablet")).toBe(true);
  });

  it("puts last-data time and the 24-hour count in the report so a silent tracker is visible", async () => {
    const { getOverview } = await import("@/features/analytics/reports");
    const { resolveRange } = await import("@/features/analytics/range");
    await send(batch());
    const o = await getOverview(resolveRange({ range: "today" }));
    expect(o.health.events24h).toBeGreaterThanOrEqual(1);
    expect(o.health.lastEventAt).not.toBeNull();
    expect(Number.isNaN(Date.parse(o.generatedAt))).toBe(false);
  });

  it("counts demo requests as visits that ended in one when a filter is on (leads carry no location)", async () => {
    const { getOverview } = await import("@/features/analytics/reports");
    const { resolveRange } = await import("@/features/analytics/range");
    const b = batch({ country: "FR", deviceType: "desktop" });
    await send({ ...b, events: [{ eventId: randomUUID(), type: "pageview", path: "/" }, { eventId: randomUUID(), type: "custom", name: "demo_request", path: "/" }] });
    const o = await getOverview(resolveRange({ range: "today" }), { country: "FR" });
    expect(o.kpis.demoRequests).toBe(1);
    expect(o.funnel.requestedDemo).toBe(1);
  });
});

describe("location drill-down: country, state, city", () => {
  it("rolls visits up to states and cities, and narrows every figure by state and by city", async () => {
    const { getOverview, listSessions } = await import("@/features/analytics/reports");
    const { resolveRange } = await import("@/features/analytics/range");
    const place = (country: string, region: string, city: string) => batch({ country, region, city });
    // Country code "NZ" is not used by any other test, so these counts are exact.
    await send(place("NZ", "Auckland", "Auckland")); await send(place("NZ", "Auckland", "Auckland")); await send(place("NZ", "Auckland", "Manukau"));
    await send(place("NZ", "Wellington", "Wellington"));
    await send(batch({ country: "NZ", region: undefined, city: undefined })); // the host could not tell the state or city
    const range = resolveRange({ range: "today" });

    const nz = await getOverview(range, { country: "NZ" });
    expect(nz.kpis.sessions).toBe(5);
    const regions = Object.fromEntries(nz.regions.map((r) => [r.region ?? "(none)", r.sessions]));
    expect(regions).toEqual({ Auckland: 3, Wellington: 1, "(none)": 1 });
    expect(nz.cities.find((c) => c.city === "Auckland")).toMatchObject({ country: "NZ", region: "Auckland", sessions: 2 });
    expect(nz.cities.find((c) => c.city === null)).toMatchObject({ sessions: 1 }); // kept, and shown as "not available", not dropped

    const auckland = await getOverview(range, { country: "NZ", region: "Auckland" });
    expect(auckland.kpis.sessions).toBe(3);
    expect(auckland.cities.map((c) => c.city).sort()).toEqual(["Auckland", "Manukau"]);
    expect(auckland.daily.reduce((a, d) => a + d.sessions, 0)).toBe(3);

    const manukau = await getOverview(range, { country: "NZ", region: "Auckland", city: "Manukau" });
    expect(manukau.kpis.sessions).toBe(1);
    expect(manukau.funnel.sessions).toBe(1);
    expect(manukau.filters).toMatchObject({ country: "NZ", region: "Auckland", city: "Manukau" });

    const list = await listSessions(range, { page: 1, pageSize: 20, filters: { country: "NZ", city: "Wellington" } });
    expect(list.total).toBe(1);
    expect(list.items[0]).toMatchObject({ city: "Wellington", region: "Wellington", country: "NZ" });
  });
});

describe("reports", () => {
  it("counts visits, visitors, channels, countries, funnel and live visitors for today", async () => {
    const { getOverview, listSessions } = await import("@/features/analytics/reports");
    const { resolveRange } = await import("@/features/analytics/range");
    const b = batch({ country: "US", region: "California", city: "San Jose", referrerHost: "www.google.com", utmCampaign: undefined });
    await send(b);
    await send({ ...b, events: [{ eventId: randomUUID(), type: "custom", name: "section_contact", path: "/" }, { eventId: randomUUID(), type: "custom", name: "form_start", path: "/" }] });
    const o = await getOverview(resolveRange({ range: "today" }));
    expect(o.kpis.sessions).toBeGreaterThanOrEqual(1);
    expect(o.live).toBeGreaterThanOrEqual(1);
    expect(o.daily).toHaveLength(1);
    expect(o.channels.map((c) => c.channel)).toContain("Organic search");
    expect(o.countries.map((c) => c.label)).toContain("US");
    expect(o.funnel.reachedContact).toBeGreaterThanOrEqual(1);
    expect(o.funnel.startedForm).toBeGreaterThanOrEqual(1);
    expect(o.topPages[0]).toMatchObject({ path: "/" });
    const list = await listSessions(resolveRange({ range: "today" }), { page: 1, pageSize: 5 });
    expect(list.total).toBeGreaterThanOrEqual(1);
    expect(list.items[0]).toHaveProperty("channel");
  });

  it("leaves visits outside the range out", async () => {
    const { getOverview } = await import("@/features/analytics/reports");
    const { resolveRange } = await import("@/features/analytics/range");
    const b = batch();
    await send(b);
    const { db } = await import("@/lib/db");
    await db.query("UPDATE analytics_sessions SET started_at = now() - interval '400 days' WHERE id = $1", [b.sessionId]);
    const before = (await getOverview(resolveRange({ range: "90d" }))).kpis.sessions;
    const all = Number((await one<{ n: number }>("SELECT count(*)::int AS n FROM analytics_sessions")).n);
    expect(before).toBeLessThan(all);
  });
});

async function lead(visitorId?: string) {
  const { createDemoRequest } = await import("@/features/demo-requests/service");
  const { demoRequestInputSchema } = await import("@/features/demo-requests/schema");
  const n = Math.floor(Math.random() * 90_000_000);
  const { id } = await createDemoRequest(demoRequestInputSchema.parse({ name: "Lead Person", company: uniq("Co"), mobile: String(6_000_000_000 + n), email: `${uniq("l")}@x.test`, visitorId }));
  return id;
}

describe("linking a visitor to a demo request", () => {
  it("shows the journey of the browser behind the request", async () => {
    const { getJourney } = await import("@/features/analytics/reports");
    const b = batch();
    await send(b);
    await send({ ...b, events: [{ eventId: randomUUID(), type: "custom", name: "demo_request", path: "/" }] });
    const id = await lead(b.visitorId);
    const j = await getJourney(id);
    expect(j.linked).toBe(true);
    expect(j.visitor).toMatchObject({ session_count: 1 });
    expect(j.sessions[0]!.events.map((e) => e.name ?? e.type)).toEqual(["pageview", "demo_request"]);
  });

  it("answers 'not linked' (not an error) for a request from a visitor who never accepted analytics", async () => {
    const { getJourney } = await import("@/features/analytics/reports");
    expect(await getJourney(await lead())).toEqual({ linked: false, visitor: null, sessions: [] });
  });

  it("answers 404 for a request that does not exist", async () => {
    const { getJourney } = await import("@/features/analytics/reports");
    await expectAppError(getJourney(randomUUID()), 404, "NOT_FOUND");
  });

  it("deleting the demo request also erases the browser's website data", async () => {
    const { deleteDemoRequest } = await import("@/features/demo-requests/service");
    const b = batch();
    await send(b);
    const id = await lead(b.visitorId);
    await deleteDemoRequest(id, admin);
    expect(await one("SELECT count(*)::int AS n FROM analytics_visitors WHERE id = $1", [b.visitorId])).toMatchObject({ n: 0 });
    expect(await one("SELECT count(*)::int AS n FROM analytics_events e JOIN analytics_sessions s ON s.id = e.session_id WHERE s.id = $1", [b.sessionId])).toMatchObject({ n: 0 });
  });
});

describe("erasure and retention", () => {
  it("forgetting a visitor removes their visits and events and unlinks the demo request but keeps the request", async () => {
    const { forgetVisitor } = await import("@/features/analytics/service");
    const b = batch();
    await send(b);
    const id = await lead(b.visitorId);
    expect(await forgetVisitor(b.visitorId)).toEqual({ removed: true });
    expect(await one("SELECT count(*)::int AS n FROM analytics_sessions WHERE visitor_id = $1", [b.visitorId])).toMatchObject({ n: 0 });
    expect(await one("SELECT visitor_id FROM demo_requests WHERE id = $1", [id])).toMatchObject({ visitor_id: null });
    expect(await forgetVisitor(b.visitorId)).toEqual({ removed: false });
  });

  it("purges data past the retention window and leaves recent data", async () => {
    const { purgeExpiredAnalytics } = await import("@/features/analytics/service");
    const { db } = await import("@/lib/db");
    const old = batch(); const fresh = batch();
    await send(old); await send(fresh);
    await db.query("UPDATE analytics_visitors SET last_seen_at = now() - interval '500 days' WHERE id = $1", [old.visitorId]);
    await db.query("UPDATE analytics_sessions SET started_at = now() - interval '500 days' WHERE id = $1", [old.sessionId]);
    const r = await purgeExpiredAnalytics(395);
    expect(r.visitors).toBeGreaterThanOrEqual(1);
    expect(await one("SELECT count(*)::int AS n FROM analytics_visitors WHERE id = $1", [old.visitorId])).toMatchObject({ n: 0 });
    expect(await one("SELECT count(*)::int AS n FROM analytics_visitors WHERE id = $1", [fresh.visitorId])).toMatchObject({ n: 1 });
  });
});
