import { describe, expect, it } from "vitest";
import { addDays, eachDay, resolveRange, todayIst } from "@/features/analytics/range";
import { classifyChannel } from "@/features/analytics/channels";
import { analyticsBatchSchema } from "@/features/analytics/schema";
import { change, countryName, duration, pct, placeLabel, toCsv } from "@/features/analytics/format";
import { hasPermission } from "@/lib/auth/permissions";
import { visibleNavGroups } from "@/components/layout/nav";

describe("report ranges", () => {
  const noon = new Date("2026-11-26T06:30:00Z"); // 12:00 in India

  it("takes the calendar day in India, not UTC", () => {
    expect(todayIst(new Date("2026-11-25T20:00:00Z"))).toBe("2026-11-26"); // 01:30 IST next day
    expect(todayIst(noon)).toBe("2026-11-26");
  });

  it("7d is today and the six days before, and the previous period is the 7 before that", () => {
    expect(resolveRange({ range: "7d" }, noon)).toEqual({ from: "2026-11-20", to: "2026-11-26", days: 7, prevFrom: "2026-11-13", prevTo: "2026-11-19" });
  });

  it("today is a single day", () => {
    expect(resolveRange({ range: "today" }, noon)).toMatchObject({ from: "2026-11-26", to: "2026-11-26", days: 1, prevFrom: "2026-11-25", prevTo: "2026-11-25" });
  });

  it("defaults to 30 days", () => expect(resolveRange({}, noon).days).toBe(30));

  it("accepts a custom range and clamps the end to today", () => {
    expect(resolveRange({ from: "2026-11-01", to: "2026-12-31" }, noon)).toMatchObject({ from: "2026-11-01", to: "2026-11-26", days: 26 });
  });

  it("refuses bad, reversed, half-given and oversized ranges", () => {
    expect(() => resolveRange({ range: "1y" }, noon)).toThrow();
    expect(() => resolveRange({ from: "2026-02-30", to: "2026-03-01" }, noon)).toThrow();
    expect(() => resolveRange({ from: "2026-11-10", to: "2026-11-01" }, noon)).toThrow();
    expect(() => resolveRange({ from: "2026-11-10" }, noon)).toThrow();
    expect(() => resolveRange({ from: "2024-01-01", to: "2026-11-01" }, noon)).toThrow();
  });

  it("lists every day, including across a month end", () => {
    expect(eachDay("2026-11-29", "2026-12-02")).toEqual(["2026-11-29", "2026-11-30", "2026-12-01", "2026-12-02"]);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe("classifyChannel", () => {
  const c = (referrerHost: string | null, utmMedium: string | null = null, utmSource: string | null = null) => classifyChannel({ referrerHost, utmMedium, utmSource });
  it("treats no referrer and no tags as direct", () => expect(c(null)).toBe("Direct"));
  it("recognises search engines", () => { expect(c("www.google.com")).toBe("Organic search"); expect(c("www.google.co.in")).toBe("Organic search"); expect(c("duckduckgo.com")).toBe("Organic search"); });
  it("recognises social sites", () => { expect(c("www.linkedin.com")).toBe("Social"); expect(c("lnkd.in")).toBe("Social"); expect(c("l.facebook.com")).toBe("Social"); expect(c("t.co")).toBe("Social"); });
  it("lets a paid or email tag win over the referrer", () => { expect(c("www.google.com", "cpc")).toBe("Paid"); expect(c("www.linkedin.com", "paid_social")).toBe("Paid"); expect(c(null, "email")).toBe("Email"); });
  it("calls any other referrer a referral", () => expect(c("example.org")).toBe("Referral"));
  it("does not mistake a lookalike host for a search engine", () => expect(c("notgoogle.com")).toBe("Referral"));
});

const batch = { visitorId: "0b0e8f36-6c1e-4a52-9d1e-1d2f3a4b5c6d", sessionId: "7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d", consentVersion: "2026-11-26" };
const event = { eventId: "11111111-2222-4333-8444-555555555555", type: "pageview", path: "/" };

describe("analytics batch validation", () => {
  it("accepts a normal batch and upper-cases the country", () => {
    const r = analyticsBatchSchema.parse({ ...batch, country: "in", deviceType: "mobile", events: [event] });
    expect(r.country).toBe("IN");
    expect(r.events[0]!.ageMs).toBe(0);
  });

  it("refuses a path with a query string or fragment (those can carry emails and tokens)", () => {
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, path: "/?email=a@b.com" }] }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, path: "/#x" }] }).success).toBe(false);
  });

  it("refuses empty and oversized batches and non-uuid ids", () => {
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [] }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, events: Array.from({ length: 21 }, (_, i) => ({ ...event, eventId: `11111111-2222-4333-8444-${String(i).padStart(12, "0")}` })) }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, visitorId: "abc", events: [event] }).success).toBe(false);
  });

  it("needs a name on custom events and rejects odd names", () => {
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, type: "custom" }] }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, type: "custom", name: "Drop Table;" }] }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, type: "custom", name: "form_start" }] }).success).toBe(true);
  });

  it("bounds time and scroll values", () => {
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, type: "engagement", durationS: 99999 }] }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, type: "engagement", scrollPct: 101 }] }).success).toBe(false);
    expect(analyticsBatchSchema.safeParse({ ...batch, events: [{ ...event, ageMs: -1 }] }).success).toBe(false);
  });

  it("strips control characters from free text and rejects a bad referrer host", () => {
    expect(analyticsBatchSchema.parse({ ...batch, city: "Ahme\u0000dabad", events: [event] }).city).toBe("Ahme dabad");
    expect(analyticsBatchSchema.safeParse({ ...batch, referrerHost: "evil.com/path", events: [event] }).success).toBe(false);
  });
});

describe("display helpers", () => {
  it("formats durations, percentages and changes", () => {
    expect(duration(45)).toBe("45s"); expect(duration(75)).toBe("1m 15s"); expect(duration(3700)).toBe("1h 1m");
    expect(pct(0.1234)).toBe("12.3%"); expect(pct(0.5, 0)).toBe("50%");
    expect(change(12, 10)).toBe("+20%"); expect(change(5, 10)).toBe("-50%"); expect(change(3, 0)).toBe("new"); expect(change(0, 0)).toBe("");
  });
  it("names countries", () => { expect(countryName("IN")).toBe("India"); expect(countryName(null)).toBe("Unknown"); });
  it("writes a place as city, state, country and skips what the host could not tell", () => {
    expect(placeLabel({ city: "Ahmedabad", region: "Gujarat", country: "IN" })).toBe("Ahmedabad, Gujarat, India");
    expect(placeLabel({ region: "Gujarat", country: "IN" })).toBe("Gujarat, India");
    expect(placeLabel({ country: "US" })).toBe("United States");
    expect(placeLabel({})).toBe("Location not available");
  });
  it("quotes CSV cells and defuses spreadsheet formulas", () => {
    expect(toCsv([["a,b", 1], ['say "hi"', 2]])).toBe('"a,b","1"\r\n"say ""hi""","2"');
    expect(toCsv([["=HYPERLINK(\"x\")"]])).toBe('"\'=HYPERLINK(""x"")"');
  });
});

describe("analytics.view permission", () => {
  it("is not held by default and is not implied by anything else", () => {
    expect(hasPermission([], "analytics.view")).toBe(false);
    expect(hasPermission(["tasks.edit_all", "demo_requests.delete"], "analytics.view")).toBe(false);
    expect(hasPermission(["analytics.view"], "analytics.view")).toBe(true);
  });
  it("hides the menu item from people without it", () => {
    const labels = (p: string[]) => visibleNavGroups(p).flatMap((g) => g.items.map((i) => i.label));
    expect(labels([])).not.toContain("Website Analytics");
    expect(labels(["analytics.view"])).toContain("Website Analytics");
  });
});

// ---- insights: what an executive reads, and the exported report ----
import { delta, funnelSteps, reportCsv } from "@/features/analytics/insights";
import type { Overview } from "@/features/analytics/reports";

const kpi = (over: Partial<Overview["kpis"]> = {}): Overview["kpis"] => ({ visitors: 40, newVisitors: 30, sessions: 50, pageviews: 90, avgActiveSeconds: 75, engagedRate: 0.6, bounceRate: 0.4, demoRequests: 2, conversionRate: 0.04, ...over });
const overview = (over: Partial<Overview> = {}): Overview => ({
  range: { from: "2026-11-01", to: "2026-11-07", days: 7, prevFrom: "2026-10-25", prevTo: "2026-10-31" }, generatedAt: "2026-11-07T10:00:00Z",
  filters: { country: null, device: null, region: null, city: null }, options: { countries: ["IN", "US"] }, health: { lastEventAt: "2026-11-07T09:59:00Z", events24h: 120 }, previousVisitors: [1, 2, 3, 4, 5, 6, 7],
  live: 2, kpis: kpi(), previous: kpi({ visitors: 20, sessions: 25 }),
  daily: [{ date: "2026-11-01", visitors: 3, sessions: 4, pageviews: 6 }, { date: "2026-11-02", visitors: 9, sessions: 12, pageviews: 20 }],
  topPages: [{ path: "/", views: 80, visitors: 38 }], entryPages: [{ path: "/", sessions: 50 }], sections: [{ name: "section_contact", sessions: 10 }],
  channels: [{ channel: "Organic search", sessions: 30, visitors: 25, demoRequests: 1 }, { channel: "Direct", sessions: 20, visitors: 15, demoRequests: 1 }],
  referrers: [{ host: "www.google.com", sessions: 30 }], campaigns: [{ campaign: "launch", source: "linkedin", medium: "social", sessions: 8, demoRequests: 1 }],
  countries: [{ label: "IN", sessions: 45, visitors: 36 }], regions: [{ country: "IN", region: "Gujarat", city: null, sessions: 30, visitors: 25, demoRequests: 1 }], cities: [{ country: "IN", region: "Gujarat", city: "Ahmedabad", sessions: 25, visitors: 20, demoRequests: 1 }],
  devices: [{ label: "desktop", sessions: 40, visitors: 30 }], browsers: [{ label: "Chrome", sessions: 40, visitors: 30 }], os: [{ label: "macOS", sessions: 20, visitors: 15 }],
  funnel: { sessions: 50, engaged: 30, reachedContact: 12, startedForm: 6, requestedDemo: 2 }, ...over,
});

describe("delta wording", () => {
  it("shows direction and size, and says why when there is nothing to compare", () => {
    expect(delta(12, 10)).toBe("▲ 20% vs previous period");
    expect(delta(5, 10)).toBe("▼ 50% vs previous period");
    expect(delta(10, 10)).toBe("same as previous period");
    expect(delta(3, 0)).toBe("no data in the previous period");
    expect(delta(0, 0)).toBe("no data in either period");
  });
});

describe("funnel steps", () => {
  it("gives each step's share of all visits and of the step before", () => {
    const s = funnelSteps({ sessions: 100, engaged: 50, reachedContact: 25, startedForm: 5, requestedDemo: 0 });
    expect(s.map((x) => x.ofTop)).toEqual([1, 0.5, 0.25, 0.05, 0]);
    expect(s.map((x) => x.ofPrevious)).toEqual([1, 0.5, 0.5, 0.2, 0]);
  });
  it("does not divide by zero on an empty period", () => {
    for (const s of funnelSteps({ sessions: 0, engaged: 0, reachedContact: 0, startedForm: 0, requestedDemo: 0 })) expect(Number.isFinite(s.ofPrevious) && Number.isFinite(s.ofTop)).toBe(true);
  });
});

describe("full report CSV", () => {
  it("has every table, the period, the filters and the consent note, and defuses formulas", () => {
    const csv = reportCsv(overview({ filters: { country: "IN", device: "mobile", region: "Gujarat", city: "Surat" }, referrers: [{ host: "=cmd|' /C calc'!A0", sessions: 1 }] }));
    for (const t of ['"Summary"', '"Day"', '"Funnel step"', '"Channel"', '"Campaign"', '"Page"', '"Section reached"', '"City"', '"Operating system"']) expect(csv).toContain(t);
    expect(csv).toContain('"Country filter","India"');
    expect(csv).toContain('"Device filter","mobile"');
    expect(csv).toContain('"State filter","Gujarat"');
    expect(csv).toContain('"City filter","Surat"');
    expect(csv).toContain('"Ahmedabad","Gujarat","India","25","20","1"');
    expect(csv).toContain("Only visitors who accepted analytics are counted");
    expect(csv).toContain(`"'=cmd|' /C calc'!A0"`);
    expect(csv).not.toMatch(/"=cmd/);
  });
});
