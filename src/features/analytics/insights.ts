// Pure: comparison wording, funnel steps and the full-report CSV. No server-only, so it is unit-tested and runs in the browser.
import type { Overview } from "./reports";
import { countryName, pct, SECTION_LABEL, toCsv } from "./format";

/** "▲ 12% vs previous period", "▼ 5% ...", or why there is nothing to compare. */
export function delta(now: number, before: number): string {
  if (!now && !before) return "no data in either period";
  if (!before) return "no data in the previous period";
  const d = Math.round(((now - before) / before) * 100);
  return d === 0 ? "same as previous period" : `${d > 0 ? "▲" : "▼"} ${Math.abs(d)}% vs previous period`;
}

/** The funnel with the share that continued from the step before, and the share of all visits. */
export function funnelSteps(f: Overview["funnel"]) {
  const steps = [
    { label: "Visits", value: f.sessions },
    { label: "Engaged (10s+, 2+ pages or scrolled)", value: f.engaged },
    { label: "Reached the contact section", value: f.reachedContact },
    { label: "Started the demo form", value: f.startedForm },
    { label: "Requested a demo", value: f.requestedDemo },
  ];
  return steps.map((s, i) => ({ ...s, ofTop: f.sessions ? s.value / f.sessions : 0, ofPrevious: i === 0 ? 1 : steps[i - 1]!.value ? s.value / steps[i - 1]!.value : 0 }));
}

/** The whole report as one spreadsheet-safe CSV: a titled block per table. */
export function reportCsv(o: Overview): string {
  const k = o.kpis, p = o.previous;
  const rows: (string | number)[][] = [
    ["DwaparEdge website analytics"], ["Period (India time)", o.range.from, o.range.to],
    ["Country filter", o.filters.country ? countryName(o.filters.country) : "All"], ["State filter", o.filters.region ?? "All"], ["City filter", o.filters.city ?? "All"], ["Device filter", o.filters.device ?? "All"],
    ["Note", "Only visitors who accepted analytics are counted"], [],
    ["Summary", "This period", "Previous period"],
    ["Visitors", k.visitors, p.visitors], ["New visitors", k.newVisitors, p.newVisitors], ["Visits", k.sessions, p.sessions], ["Page views", k.pageviews, p.pageviews],
    ["Average active seconds", k.avgActiveSeconds, p.avgActiveSeconds], ["Engaged rate", pct(k.engagedRate), pct(p.engagedRate)],
    ["Demo requests", k.demoRequests, p.demoRequests], ["Visit to demo rate", pct(k.conversionRate), pct(p.conversionRate)], [],
    ["Day", "Visitors", "Visits", "Page views"], ...o.daily.map((d) => [d.date, d.visitors, d.sessions, d.pageviews]), [],
    ["Funnel step", "Visits", "% of all visits", "% of previous step"], ...funnelSteps(o.funnel).map((s) => [s.label, s.value, pct(s.ofTop), pct(s.ofPrevious)]), [],
    ["Channel", "Visits", "Visitors", "Demo requests"], ...o.channels.map((c) => [c.channel, c.sessions, c.visitors, c.demoRequests]), [],
    ["Referring site", "Visits"], ...o.referrers.map((r) => [r.host, r.sessions]), [],
    ["Campaign", "Source", "Medium", "Visits", "Demo requests"], ...o.campaigns.map((c) => [c.campaign, c.source, c.medium, c.sessions, c.demoRequests]), [],
    ["Page", "Views", "Visitors"], ...o.topPages.map((r) => [r.path, r.views, r.visitors]), [],
    ["Entry page", "Visits"], ...o.entryPages.map((r) => [r.path, r.sessions]), [],
    ["Section reached", "Visits"], ...o.sections.map((s) => [SECTION_LABEL[s.name] ?? s.name, s.sessions]), [],
    ["Country", "Visits", "Visitors"], ...o.countries.map((c) => [countryName(c.label === "Unknown" ? null : c.label), c.sessions, c.visitors]), [],
    ["State / region", "Country", "Visits", "Visitors", "Demo requests"], ...o.regions.map((c) => [c.region ?? "not available", c.country ? countryName(c.country) : "not available", c.sessions, c.visitors, c.demoRequests]), [],
    ["City", "State / region", "Country", "Visits", "Visitors", "Demo requests"], ...o.cities.map((c) => [c.city ?? "not available", c.region ?? "not available", c.country ? countryName(c.country) : "not available", c.sessions, c.visitors, c.demoRequests]), [],
    ["Device", "Visits"], ...o.devices.map((c) => [c.label, c.sessions]), [],
    ["Browser", "Visits"], ...o.browsers.map((c) => [c.label, c.sessions]), [],
    ["Operating system", "Visits"], ...o.os.map((c) => [c.label, c.sessions]),
  ];
  return toCsv(rows);
}
