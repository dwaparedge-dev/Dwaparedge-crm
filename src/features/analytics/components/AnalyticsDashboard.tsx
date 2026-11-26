"use client";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { format, formatDistanceToNow } from "date-fns";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import Alert from "@mui/material/Alert";
import PeopleIcon from "@mui/icons-material/PeopleAltOutlined";
import VisitIcon from "@mui/icons-material/TravelExploreOutlined";
import ViewIcon from "@mui/icons-material/VisibilityOutlined";
import TimerIcon from "@mui/icons-material/TimerOutlined";
import DemoIcon from "@mui/icons-material/ContactPhoneOutlined";
import RefreshIcon from "@mui/icons-material/Refresh";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import type { GridColDef } from "@mui/x-data-grid";
import Link from "next/link";
import { PageHeader } from "@/components/common/PageHeader";
import { StatCards } from "@/components/common/StatCards";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { useFetch } from "@/components/common/useFetch";
import ChartCard from "@/components/shared/ChartCard";
import CommonLineAreaChart from "@/components/shared/charts/CommonLineAreaChart";
import { useCurrentUser } from "@/components/layout/CurrentUserContext";
import { hasPermission } from "@/lib/auth/permissions";
import type { Overview, SessionRow } from "../reports";
import { countryName, duration, pct, SECTION_LABEL } from "../format";
import { delta, funnelSteps, reportCsv } from "../insights";
import { BarList, downloadCsv } from "./BarList";

const RANGES = [{ value: "today", label: "Today" }, { value: "7d", label: "7 days" }, { value: "30d", label: "30 days" }, { value: "90d", label: "90 days" }];
const VIEWS = [{ value: "overview", label: "Overview" }, { value: "sources", label: "Traffic sources" }, { value: "pages", label: "Pages" }, { value: "audience", label: "Audience" }, { value: "visits", label: "Visits" }];
const DEVICES = ["desktop", "mobile", "tablet"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const rows = (list: { label: string; sessions: number }[]) => list.map((r) => ({ label: r.label, value: r.sessions }));
const pick = (v: string | null, allowed: string[], fallback: string) => (v && allowed.includes(v) ? v : fallback);

function Funnel({ f }: { f: Overview["funnel"] }) {
  const steps = funnelSteps(f);
  return (
    <ChartCard title="From visit to demo request" subtitle="Each bar is the share of all visits; the grey note is how many of the step before carried on">
      <Box sx={{ display: "grid", gap: 1.25 }}>
        {steps.map((s, i) => (
          <Box key={s.label}>
            <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, mb: 0.25 }}>
              <Typography variant="body2">{s.label}</Typography>
              <Typography variant="body2" sx={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                {s.value.toLocaleString("en-IN")} <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}>· {pct(s.ofTop)}{i > 0 ? ` · ${pct(s.ofPrevious, 0)} of previous` : ""}</Box>
              </Typography>
            </Box>
            <Box sx={{ height: 8, borderRadius: 4, bgcolor: "action.hover" }}><Box sx={{ height: 8, borderRadius: 4, bgcolor: "primary.main", width: `${s.ofTop * 100}%`, minWidth: s.value ? 4 : 0 }} /></Box>
          </Box>
        ))}
      </Box>
    </ChartCard>
  );
}

function Heatmap({ cells }: { cells: Overview["heatmap"] }) {
  const grid = new Map(cells.map((c) => [`${c.dow}-${c.hour}`, c.sessions]));
  const max = Math.max(1, ...cells.map((c) => c.sessions));
  return (
    <ChartCard title="When people visit" subtitle="Visits by day and hour (India time). Darker = more visits">
      <Box sx={{ overflowX: "auto" }}>
        <Box sx={{ display: "grid", gridTemplateColumns: "36px repeat(24, minmax(14px, 1fr))", gap: "2px", minWidth: 520 }}>
          <Box />
          {Array.from({ length: 24 }, (_, h) => <Typography key={h} variant="caption" sx={{ textAlign: "center", fontSize: 9, color: "text.secondary" }}>{h % 3 === 0 ? h : ""}</Typography>)}
          {DAYS.map((d, dow) => (
            <Box key={d} sx={{ display: "contents" }}>
              <Typography variant="caption" sx={{ color: "text.secondary", lineHeight: "16px" }}>{d}</Typography>
              {Array.from({ length: 24 }, (_, h) => {
                const n = grid.get(`${dow}-${h}`) ?? 0;
                return <Box key={h} title={`${d} ${h}:00, ${n} visit${n === 1 ? "" : "s"}`} sx={{ height: 16, borderRadius: "3px", bgcolor: n ? "primary.main" : "action.hover", opacity: n ? 0.15 + 0.85 * (n / max) : 1 }} />;
              })}
            </Box>
          ))}
        </Box>
      </Box>
    </ChartCard>
  );
}

function Visits({ qs }: { qs: string }) {
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(10);
  const [only, setOnly] = useState("");
  const params = new URLSearchParams(qs);
  params.set("page", String(page + 1)); params.set("pageSize", String(pageSize));
  if (only) params.set("only", only);
  const { data, error, loading, reload } = useFetch<{ items: SessionRow[]; total: number }>(`/api/analytics/sessions?${params}`);
  const columns: GridColDef<SessionRow>[] = [
    { field: "started_at", headerName: "When", width: 170, valueFormatter: (v: string) => format(new Date(v), "dd MMM yyyy, hh:mm a") },
    { field: "city", headerName: "Where", minWidth: 200, valueGetter: (_v, r) => [r.city, r.region, countryName(r.country)].filter(Boolean).join(", ") },
    { field: "channel", headerName: "From", width: 150, valueGetter: (_v, r) => r.utm_campaign ? `${r.channel} · ${r.utm_campaign}` : r.referrer_host && r.channel !== "Direct" ? `${r.channel} · ${r.referrer_host}` : r.channel },
    { field: "device_type", headerName: "Device", width: 170, valueGetter: (_v, r) => [r.device_type, r.browser, r.os].filter(Boolean).join(" · ") },
    { field: "page_count", headerName: "Pages", width: 80, type: "number" },
    { field: "active_s", headerName: "Active time", width: 110, valueFormatter: (v: number) => duration(v) },
    { field: "lead_company", headerName: "Became a lead", minWidth: 190, renderCell: ({ row: r }) => r.lead_id ? <Link href={`/demo-requests/${r.lead_id}`} onClick={(e) => e.stopPropagation()}>{r.lead_company}</Link> : r.demo_requested ? "Requested a demo" : "—" },
  ];
  return (
    <ChartCard title="Individual visits" subtitle="Newest first. No names or addresses are stored; a visit shows a company only when that browser later booked a demo."
      action={<SegmentedTabs value={only} onChange={(v) => { setOnly(v); setPage(0); }} tabs={[{ value: "", label: "All" }, { value: "converted", label: "Asked for a demo" }, { value: "identified", label: "Known leads" }]} />} noPadding>
      {error ? <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box> : (
        <DataTable<SessionRow> label="Website visits" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
          page={page} pageSize={pageSize} onPageChange={(p, s) => { setPage(p); setPageSize(s); }}
          emptyTitle="No visits in this period" emptyHint="Visits appear after a visitor accepts analytics on the website." />
      )}
    </ChartCard>
  );
}

/** Tells staff when the tracker has gone quiet: the earliest sign that something on the website broke. */
function HealthNotice({ h }: { h: Overview["health"] }) {
  if (!h.lastEventAt) return <Alert severity="info" sx={{ mb: 2.5 }}>No data has been received yet. It starts arriving once a visitor accepts analytics on the website and the website is connected to this CRM.</Alert>;
  if (h.events24h === 0) return <Alert severity="warning" sx={{ mb: 2.5 }}>No data has arrived in the last 24 hours (last received {formatDistanceToNow(new Date(h.lastEventAt), { addSuffix: true })}). If the website is getting visitors, check that its CRM address and key are set.</Alert>;
  return null;
}

export function AnalyticsDashboard() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const canView = hasPermission(useCurrentUser().permissions, "analytics.view");

  // The view, period and filters live in the address, so a report can be bookmarked or sent to a colleague.
  const view = pick(sp.get("view"), VIEWS.map((v) => v.value), "overview");
  const range = pick(sp.get("range"), RANGES.map((r) => r.value), "30d");
  const country = /^[A-Za-z]{2}$/.test(sp.get("country") ?? "") ? sp.get("country")!.toUpperCase() : "";
  const device = pick(sp.get("device"), DEVICES, "");
  const set = (patch: Record<string, string>) => {
    const next = new URLSearchParams(sp.toString());
    for (const [k, v] of Object.entries(patch)) { if (v) next.set(k, v); else next.delete(k); }
    router.replace(`${pathname}?${next}`, { scroll: false });
  };

  const q = new URLSearchParams({ range });
  if (country) q.set("country", country);
  if (device) q.set("device", device);
  const qs = q.toString();
  const { data, error, loading, reload } = useFetch<Overview>(canView ? `/api/analytics/overview?${qs}` : null);

  if (!canView) return <><PageHeader title="Website Analytics" /><Alert severity="info" sx={{ mt: 2 }}>Your account does not have access to website analytics. Ask an administrator for the “analytics.view” permission.</Alert></>;

  const k = data?.kpis; const p = data?.previous;
  const countries = data ? [...new Set([...data.options.countries, ...(country ? [country] : [])])] : country ? [country] : [];
  const filtered = Boolean(country || device);
  const showMarkers = (data?.daily.length ?? 0) <= 14;
  return (
    <>
      <PageHeader title="Website Analytics" subtitle="Who visits the DwaparEdge website, from where, and what they do. Only visitors who accept analytics are counted." crumbs={[{ label: "Dashboard", href: "/" }, { label: "Website Analytics" }]}
        actions={<Chip size="small" sx={{ bgcolor: "rgb(255 255 255 / 0.2)", color: "#fff" }} label={`${data?.live ?? 0} on the site now`} />} />
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, alignItems: "center", justifyContent: "space-between", mb: 1.5 }}>
        <SegmentedTabs value={view} onChange={(v) => set({ view: v === "overview" ? "" : v })} tabs={VIEWS} />
        <SegmentedTabs value={range} onChange={(v) => set({ range: v === "30d" ? "" : v })} tabs={RANGES} />
      </Box>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1.5, alignItems: "center", mb: 2.5 }}>
        <TextField id="analytics-country" select size="small" label="Country" value={country} onChange={(e) => set({ country: e.target.value })} sx={{ minWidth: 170 }}>
          <MenuItem value="">All countries</MenuItem>
          {countries.map((c) => <MenuItem key={c} value={c}>{countryName(c)}</MenuItem>)}
        </TextField>
        <TextField id="analytics-device" select size="small" label="Device" value={device} onChange={(e) => set({ device: e.target.value })} sx={{ minWidth: 150 }}>
          <MenuItem value="">All devices</MenuItem>
          {DEVICES.map((d) => <MenuItem key={d} value={d} sx={{ textTransform: "capitalize" }}>{d}</MenuItem>)}
        </TextField>
        {filtered && <Button id="analytics-clear" size="small" onClick={() => set({ country: "", device: "" })}>Clear filters</Button>}
        <Box sx={{ flexGrow: 1 }} />
        {data && <Typography variant="caption" color="text.secondary">{data.range.from === data.range.to ? data.range.from : `${data.range.from} to ${data.range.to}`} · updated {format(new Date(data.generatedAt), "hh:mm a")}</Typography>}
        <Tooltip title="Refresh"><span><IconButton id="analytics-refresh" size="small" aria-label="Refresh the report" onClick={reload} disabled={loading}><RefreshIcon fontSize="small" /></IconButton></span></Tooltip>
        <Button id="analytics-export" size="small" variant="outlined" startIcon={<DownloadIcon />} disabled={!data} onClick={() => data && downloadCsv(`website-analytics-${data.range.from}-to-${data.range.to}`, reportCsv(data))}>Download report</Button>
      </Box>
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <>
          {data && <HealthNotice h={data.health} />}
          <StatCards loading={!data || loading} stats={[
            { label: "Visitors", value: (k?.visitors ?? 0).toLocaleString("en-IN"), hint: `${k?.newVisitors ?? 0} new · ${delta(k?.visitors ?? 0, p?.visitors ?? 0)}`, icon: <PeopleIcon /> },
            { label: "Visits", value: (k?.sessions ?? 0).toLocaleString("en-IN"), hint: `${pct(k?.bounceRate ?? 0, 0)} left quickly · ${delta(k?.sessions ?? 0, p?.sessions ?? 0)}`, icon: <VisitIcon /> },
            { label: "Page views", value: (k?.pageviews ?? 0).toLocaleString("en-IN"), hint: delta(k?.pageviews ?? 0, p?.pageviews ?? 0), icon: <ViewIcon /> },
            { label: "Time on site", value: duration(k?.avgActiveSeconds ?? 0), hint: `average active time · ${delta(k?.avgActiveSeconds ?? 0, p?.avgActiveSeconds ?? 0)}`, icon: <TimerIcon /> },
            { label: filtered ? "Visits with a demo request" : "Demo requests", value: k?.demoRequests ?? 0, hint: `${pct(k?.conversionRate ?? 0, 1)} of visits · ${delta(k?.demoRequests ?? 0, p?.demoRequests ?? 0)}`, icon: <DemoIcon /> },
          ]} />
          {data && (
            <>
              {data.kpis.sessions === 0 && <Alert severity="info" sx={{ mb: 2.5 }}>{filtered ? "No visits match these filters in this period." : "No visits recorded in this period yet."} Visits are counted only after a visitor accepts analytics on the website, so the numbers are a floor, not the total traffic.</Alert>}
              {view === "overview" && (
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12 }}>
                    <ChartCard title="Traffic over time" subtitle="Per day, India time. The dashed line is visitors in the previous period of the same length">
                      <CommonLineAreaChart id="analytics-daily" type="line" showMarkers={showMarkers} height={300} legend="top"
                        data={data.daily.map((d) => ({ label: format(new Date(`${d.date}T00:00:00`), "dd MMM") }))} xKey="label"
                        series={[
                          { name: "Visitors", data: data.daily.map((d) => d.visitors) },
                          { name: "Visits", data: data.daily.map((d) => d.sessions) },
                          { name: "Page views", data: data.daily.map((d) => d.pageviews) },
                          { name: "Visitors (previous period)", data: data.previousVisitors },
                        ]}
                        colors={["#1e293b", "#64748b", "#38bdf8", "#94a3b8"]} valueFormatter={(v) => String(Math.round(v))}
                        customOptions={{ stroke: { curve: "smooth", width: [3, 3, 3, 2], dashArray: [0, 0, 0, 6] } }} />
                    </ChartCard>
                  </Grid>
                  <Grid size={{ xs: 12, md: 6 }}><Funnel f={data.funnel} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><Heatmap cells={data.heatmap} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><BarList id="channels" title="Where visitors come from" rows={rows(data.channels.map((c) => ({ label: c.channel, sessions: c.sessions })))} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><BarList id="countries" title="Top countries" rows={rows(data.countries.map((c) => ({ label: countryName(c.label === "Unknown" ? null : c.label), sessions: c.sessions })))} /></Grid>
                </Grid>
              )}
              {view === "sources" && (
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, md: 6 }}><BarList id="channels" title="Channels" subtitle="Direct, search, social, paid, email, referral" rows={data.channels.map((c) => ({ label: c.channel, value: c.sessions, hint: c.demoRequests ? `${c.demoRequests} demo` : undefined }))} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><BarList id="referrers" title="Referring websites" rows={data.referrers.map((r) => ({ label: r.host, value: r.sessions }))} empty="No referring websites yet" /></Grid>
                  <Grid size={{ xs: 12 }}><BarList id="campaigns" title="Campaigns" subtitle="From links tagged with utm_campaign" rows={data.campaigns.map((c) => ({ label: [c.campaign, c.source, c.medium].filter(Boolean).join(" · "), value: c.sessions, hint: c.demoRequests ? `${c.demoRequests} demo` : undefined }))} empty="No tagged campaign links yet. Add ?utm_source=…&utm_medium=…&utm_campaign=… to links you share." /></Grid>
                </Grid>
              )}
              {view === "pages" && (
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, md: 6 }}><BarList id="top-pages" title="Most viewed pages" valueLabel="Views" rows={data.topPages.map((r) => ({ label: r.path, value: r.views, hint: `${r.visitors} visitors` }))} /></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><BarList id="entry-pages" title="Entry pages" subtitle="Where visits begin" rows={data.entryPages.map((r) => ({ label: r.path, value: r.sessions }))} /></Grid>
                  <Grid size={{ xs: 12 }}><BarList id="sections" title="Sections scrolled into view" subtitle="Visits that reached each part of the home page" rows={data.sections.map((s) => ({ label: SECTION_LABEL[s.name] ?? s.name, value: s.sessions }))} /></Grid>
                </Grid>
              )}
              {view === "audience" && (
                <Grid container spacing={2.5}>
                  <Grid size={{ xs: 12, md: 4 }}><BarList id="countries" title="Countries" rows={rows(data.countries.map((c) => ({ label: countryName(c.label === "Unknown" ? null : c.label), sessions: c.sessions })))} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><BarList id="regions" title="States / regions" rows={rows(data.regions)} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><BarList id="cities" title="Cities" rows={rows(data.cities)} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><BarList id="devices" title="Devices" rows={rows(data.devices)} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><BarList id="browsers" title="Browsers" rows={rows(data.browsers)} /></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><BarList id="os" title="Operating systems" rows={rows(data.os)} /></Grid>
                </Grid>
              )}
              {view === "visits" && <Visits qs={qs} />}
            </>
          )}
        </>
      )}
    </>
  );
}
