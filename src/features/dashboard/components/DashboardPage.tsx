"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import LinearProgress from "@mui/material/LinearProgress";
import MenuItem from "@mui/material/MenuItem";
import Tab from "@mui/material/Tab";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import ArrowForwardIcon from "@mui/icons-material/ArrowForward";
import RefreshIcon from "@mui/icons-material/Refresh";
import WarningIcon from "@mui/icons-material/WarningAmberOutlined";
import { format, parse, parseISO } from "date-fns";
import ChartCard from "@/components/shared/ChartCard";
import BaseChart from "@/components/shared/charts/BaseChart";
import CommonLineAreaChart from "@/components/shared/charts/CommonLineAreaChart";
import CommonPieChart from "@/components/shared/charts/CommonPieChart";
import { DashboardBodySkeleton } from "@/components/common/PageSkeletons";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { RANGE_PRESETS, presetRange, type RangePreset } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { RecordPaymentDialog } from "@/features/payments/components/RecordPaymentDialog";
import type { getDashboard } from "../service";
import { compactInr } from "./compact";

type Data = Awaited<ReturnType<typeof getDashboard>>;

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const num = (v: string | number) => Number(v);
const INK = "#384152";
const GREEN = "#2E7D32";
const AMBER = "#FDB528";
const RED = "#FF4D49";
const CYAN = "#26C6F9";
const GREY = "#9AA3B2";

/** Compact table used inside cards. */
const tableSx = {
  "& .MuiTableCell-root": { py: 0.9, px: 1.5, fontSize: "0.8125rem", whiteSpace: "nowrap" },
  "& .MuiTableCell-head": { py: 0.75, fontSize: "0.68rem" },
  "& .MuiTableRow-root:last-child .MuiTableCell-body": { borderBottom: 0 },
  "& .num": { textAlign: "right", fontVariantNumeric: "tabular-nums" },
};

function Delta({ current, previous, invert = false }: { current: number; previous: number; invert?: boolean }) {
  if (previous <= 0) return <Typography variant="caption" color="text.secondary">{current > 0 ? "New this period" : "No activity"}</Typography>;
  const pct = Math.round(((current - previous) / previous) * 100);
  const good = pct === 0 ? null : (pct > 0) !== invert;
  return (
    <Typography variant="caption" sx={{ fontWeight: 700, color: good === null ? "text.secondary" : good ? "success.main" : "error.main" }}>
      {pct >= 0 ? "▲" : "▼"} {Math.abs(pct)}%
      <Typography component="span" variant="caption" color="text.secondary" sx={{ fontWeight: 400 }}> vs previous</Typography>
    </Typography>
  );
}

function Kpi({ label, value, footer, color, href, spark, tone }: { label: string; value: string; footer: React.ReactNode; color: string; href: string; spark?: number[]; tone?: string }) {
  return (
    <Card component={Link} href={href} sx={{ display: "block", height: "100%", color: "inherit", textDecoration: "none", p: 1.75, pb: 1.25, borderRadius: "12px", border: "1px solid rgba(226,232,240,0.9)", boxShadow: "0 2px 10px rgba(15,23,42,0.05)", position: "relative", overflow: "hidden", transition: "box-shadow .2s, transform .2s", "&:hover": { boxShadow: "0 8px 22px rgba(15,23,42,0.1)", transform: "translateY(-2px)" }, "&::before": { content: '""', position: "absolute", left: 0, right: 0, top: 0, height: 3, bgcolor: color } }}>
      <Typography sx={{ fontSize: "0.7rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>{label}</Typography>
      <Typography sx={{ fontSize: "1.45rem", fontWeight: 700, lineHeight: 1.25, mt: 0.25, color: tone ?? "text.primary", fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      <Box sx={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", mt: 0.5, minHeight: 34 }}>
        <Box sx={{ minWidth: 0, pb: 0.25 }}>{footer}</Box>
        {spark && spark.some((v) => v > 0) && (
          <Box sx={{ width: 84, height: 34, flexShrink: 0, mr: -0.5 }}>
            <BaseChart type="area" height={34} series={[{ name: label, data: spark }]}
              options={{ chart: { sparkline: { enabled: true }, animations: { enabled: false } }, stroke: { curve: "smooth", width: 2 }, colors: [color], fill: { type: "gradient", gradient: { opacityFrom: 0.35, opacityTo: 0.02 } }, tooltip: { enabled: false } }} />
          </Box>
        )}
      </Box>
    </Card>
  );
}

const viewAll = (href: string) => (
  <Button size="small" component={Link} href={href} endIcon={<ArrowForwardIcon sx={{ fontSize: 14 }} />} sx={{ fontSize: "0.75rem", py: 0 }}>View all</Button>
);

function Share({ value, color }: { value: number; color: string }) {
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 110 }}>
      <LinearProgress variant="determinate" value={Math.min(Math.max(value, 0), 100)} sx={{ flex: 1, height: 6, borderRadius: 3, bgcolor: "action.hover", "& .MuiLinearProgress-bar": { bgcolor: color, borderRadius: 3 } }} />
      <Typography variant="caption" sx={{ width: 34, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{Math.round(value)}%</Typography>
    </Box>
  );
}

function StatLine({ label, value, strong }: { label: string; value: React.ReactNode; strong?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.85, borderBottom: 1, borderColor: "divider", "&:last-child": { borderBottom: 0 } }}>
      <Typography variant="body2" color={strong ? "text.primary" : "text.secondary"} sx={{ fontWeight: strong ? 700 : 400 }}>{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: strong ? 700 : 600, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
    </Box>
  );
}

const Empty = ({ children }: { children: React.ReactNode }) => <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>{children}</Typography>;

/** A table row that opens a record (a real <a> cannot sit directly inside <tbody>). */
function LinkRow({ href, children }: { href: string; children: React.ReactNode }) {
  const router = useRouter();
  return (
    <TableRow hover tabIndex={0} role="link" onClick={() => router.push(href)} onKeyDown={(e) => { if (e.key === "Enter") router.push(href); }} sx={{ cursor: "pointer" }}>
      {children}
    </TableRow>
  );
}

const STATUS_COLOR: Record<string, string> = { draft: GREY, confirmed: CYAN, completed: GREEN };

export function DashboardPage() {
  const [preset, setPreset] = useState<RangePreset | "custom">("this_month");
  const [range, setRange] = useState<[string, string]>(() => presetRange("this_month"));
  const [paying, setPaying] = useState(false);
  const [tab, setTab] = useState(0);
  const { data: d, error, loading, reload } = useFetch<Data>(`/api/dashboard?from=${range[0]}&to=${range[1]}`);

  const rangeValid = range[0] && range[1] && range[0] <= range[1];
  const fmtRange = rangeValid ? `${format(parseISO(range[0]), "dd MMM yyyy")} – ${format(parseISO(range[1]), "dd MMM yyyy")}` : "";

  const calc = useMemo(() => {
    if (!d) return null;
    const invoiced = num(d.billing.invoiced.amount);
    const collected = num(d.billing.collected.amount);
    const outstanding = num(d.billing.outstanding.amount);
    const overdue = num(d.billing.overdue.amount);
    const agingTotal = d.aging.reduce((a, b) => a + b.amount, 0);
    const pipeTotal = d.pipeline.reduce((a, b) => a + num(b.value), 0);
    return {
      invoiced, collected, outstanding, overdue, agingTotal, pipeTotal,
      rate: invoiced > 0 ? (collected / invoiced) * 100 : null,
      overdueShare: outstanding > 0 ? (overdue / outstanding) * 100 : 0,
      avgInvoice: d.billing.invoiced.count > 0 ? invoiced / d.billing.invoiced.count : 0,
      trend6: { invoiced: d.trend.reduce((a, t) => a + t.invoiced, 0), collected: d.trend.reduce((a, t) => a + t.collected, 0) },
    };
  }, [d]);

  const attention = d ? [
    d.billing.overdue.invoices > 0 && { tone: "error" as const, text: `${plural(d.billing.overdue.invoices, "overdue invoice")} · ${formatMoney(d.billing.overdue.amount)}`, href: "/invoices" },
    d.licenses.expired > 0 && { tone: "error" as const, text: `${plural(d.licenses.expired, "licence")} expired`, href: "/licenses" },
    d.licenses.expiring7 > 0 && { tone: "warning" as const, text: `${plural(d.licenses.expiring7, "licence")} expiring in 7 days`, href: "/licenses" },
    d.sales.salesToBill > 0 && { tone: "info" as const, text: `${plural(d.sales.salesToBill, "sale")} left to bill`, href: "/sales" },
  ].filter(Boolean) as { tone: "error" | "warning" | "info"; text: string; href: string }[] : [];

  const tabs = d ? [
    { label: "Recent invoices", count: d.recentInvoices.length, href: "/invoices" },
    { label: "Recent payments", count: d.recentPayments.length, href: "/payments" },
    { label: "Due in 14 days", count: d.upcomingDues.length, href: "/invoices" },
    { label: "Licences to renew", count: d.expiringLicenses.length, href: "/licenses" },
    { label: "Activity", count: d.recentActivity.length, href: "" },
  ] : [];

  return (
    <>
      <PageHeader
        title="Dashboard"
        subtitle="Business overview: billing, receivables and licences"
        actions={
          <>
            <Button component={Link} href="/clients/new" variant="outlined" startIcon={<AddIcon />}>Add client</Button>
            <Button component={Link} href="/invoices/new" variant="outlined" startIcon={<AddIcon />}>Create invoice</Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setPaying(true)}>Record payment</Button>
            <Button component={Link} href="/licenses/new" variant="outlined" startIcon={<AddIcon />}>Issue license</Button>
          </>
        }
      />
      <Box sx={{ display: "flex", gap: 1.5, flexWrap: "wrap", my: 1.5, alignItems: "center" }}>
        <TextField select size="small" label="Period" value={preset} sx={{ minWidth: 180 }}
          onChange={(e) => { const v = e.target.value as RangePreset | "custom"; setPreset(v); if (v !== "custom") setRange(presetRange(v)); }}>
          {RANGE_PRESETS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          <MenuItem value="custom">Custom range</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="From" value={range[0]} slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => { setPreset("custom"); setRange([e.target.value, range[1]]); }} />
        <TextField size="small" type="date" label="To" value={range[1]} slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => { setPreset("custom"); setRange([range[0], e.target.value]); }} />
        <Tooltip title="Refresh"><span><IconButton size="small" onClick={reload} disabled={loading} aria-label="Refresh dashboard"><RefreshIcon /></IconButton></span></Tooltip>
        {d && <Typography variant="caption" color="text.secondary">Updated {format(new Date(d.generatedAt), "dd MMM, hh:mm a")}</Typography>}
        {!rangeValid && <Typography color="error" variant="body2">The start date must be on or before the end date.</Typography>}
        {attention.length > 0 && (
          <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap", alignItems: "center", ml: { lg: "auto" } }}>
            <WarningIcon sx={{ fontSize: 18, color: "text.secondary" }} />
            {attention.map((a) => <Chip key={a.text} size="small" component={Link} href={a.href} clickable color={a.tone} variant="outlined" label={a.text} />)}
          </Box>
        )}
      </Box>

      {error ? <ErrorState message={error} onRetry={reload} /> : !d || !calc ? (
        <DashboardBodySkeleton />
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1, display: "grid", gap: 2, pb: 3 }}>
          {/* KPI strip */}
          <Grid container spacing={1.5}>
            <Grid size={{ xs: 6, md: 4, xl: 2 }}><Kpi label="Invoiced" value={compactInr(calc.invoiced)} color={INK} href="/invoices" spark={d.trend.map((t) => t.invoiced)}
              footer={<><Delta current={calc.invoiced} previous={d.previous.invoiced} /><Typography variant="caption" color="text.secondary" component="div">{plural(d.billing.invoiced.count, "invoice")}</Typography></>} /></Grid>
            <Grid size={{ xs: 6, md: 4, xl: 2 }}><Kpi label="Collected" value={compactInr(calc.collected)} color={GREEN} tone={GREEN} href="/payments" spark={d.trend.map((t) => t.collected)}
              footer={<><Delta current={calc.collected} previous={d.previous.collected} /><Typography variant="caption" color="text.secondary" component="div">{plural(d.billing.collected.count, "payment")}</Typography></>} /></Grid>
            <Grid size={{ xs: 6, md: 4, xl: 2 }}><Kpi label="Outstanding" value={compactInr(calc.outstanding)} color={AMBER} href="/invoices"
              footer={<Typography variant="caption" color="text.secondary">{plural(d.billing.outstanding.invoices, "open invoice")}</Typography>} /></Grid>
            <Grid size={{ xs: 6, md: 4, xl: 2 }}><Kpi label="Overdue" value={compactInr(calc.overdue)} color={RED} tone={calc.overdue > 0 ? RED : undefined} href="/invoices"
              footer={<Typography variant="caption" color="text.secondary">{calc.overdue > 0 ? `${Math.round(calc.overdueShare)}% of outstanding` : "Nothing overdue"}</Typography>} /></Grid>
            <Grid size={{ xs: 6, md: 4, xl: 2 }}><Kpi label="Advances" value={compactInr(num(d.billing.advances))} color={CYAN} href="/payments"
              footer={<Typography variant="caption" color="text.secondary">received, not applied</Typography>} /></Grid>
            <Grid size={{ xs: 6, md: 4, xl: 2 }}><Kpi label="Left to bill" value={compactInr(num(d.sales.toBill))} color="#7c3aed" href="/sales"
              footer={<Typography variant="caption" color="text.secondary">{plural(d.sales.salesToBill, "sale")} · {d.sales.open} open</Typography>} /></Grid>
          </Grid>
          <Typography variant="caption" color="text.secondary" sx={{ mt: -1 }}>{fmtRange}: invoiced and collected cover this period. Outstanding, overdue and advances are as of today.</Typography>

          {/* Revenue + collection efficiency */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 8 }}>
              <ChartCard title="Revenue & collections" subtitle="Last six months to the end of the period" height={352}>
                <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, 1fr)", sm: "repeat(4, 1fr)" }, gap: 1, mb: 0.5 }}>
                  {[
                    ["Invoiced (6 mo)", compactInr(calc.trend6.invoiced)],
                    ["Collected (6 mo)", compactInr(calc.trend6.collected)],
                    ["Monthly average", compactInr(calc.trend6.collected / Math.max(d.trend.length, 1))],
                    ["Collection rate", calc.trend6.invoiced > 0 ? `${Math.round((calc.trend6.collected / calc.trend6.invoiced) * 100)}%` : "–"],
                  ].map(([l, v]) => (
                    <Box key={l}>
                      <Typography variant="caption" color="text.secondary">{l}</Typography>
                      <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.2 }}>{v}</Typography>
                    </Box>
                  ))}
                </Box>
                <CommonLineAreaChart compact showExport={false} height={236} legend="top" type="area"
                  data={d.trend.map((t) => ({ label: format(parse(t.month, "yyyy-MM", new Date()), "MMM yy"), invoiced: t.invoiced, collected: t.collected }))}
                  xKey="label" yKeys={["invoiced", "collected"]} seriesNames={["Invoiced", "Collected"]} colors={[INK, GREEN]} valueFormatter={compactInr}
                  customOptions={{ fill: { type: "gradient", gradient: { shadeIntensity: 1, opacityFrom: 0.3, opacityTo: 0.03, stops: [0, 95, 100] } } }} />
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Collection efficiency" subtitle="Selected period" height={352}>
                <BaseChart type="radialBar" height={190} series={[Math.min(Math.round(calc.rate ?? 0), 100)]}
                  noData={calc.rate === null}
                  options={{
                    labels: ["Collected"], colors: [calc.rate !== null && calc.rate >= 80 ? GREEN : calc.rate !== null && calc.rate >= 50 ? AMBER : RED],
                    plotOptions: { radialBar: { hollow: { size: "62%" }, track: { background: "#EEF1F6" }, dataLabels: { name: { offsetY: 22, fontSize: "12px", color: "#64748B" }, value: { offsetY: -14, fontSize: "26px", fontWeight: 700, formatter: () => (calc.rate === null ? "–" : `${Math.round(calc.rate)}%`) } } } },
                    stroke: { lineCap: "round" },
                  }} />
                <Box sx={{ mt: 0.5 }}>
                  <StatLine label="Average days to pay" value={d.efficiency.avgDaysToPay === null ? "–" : `${Math.round(d.efficiency.avgDaysToPay)} days`} />
                  <StatLine label="Paid by due date" value={d.efficiency.onTimeShare === null ? "–" : `${Math.round(d.efficiency.onTimeShare * 100)}%`} />
                  <StatLine label="Average invoice value" value={calc.avgInvoice > 0 ? compactInr(calc.avgInvoice) : "–"} />
                </Box>
              </ChartCard>
            </Grid>
          </Grid>

          {/* Receivables */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ChartCard title="Receivables ageing" subtitle={`${formatMoney(d.billing.outstanding.amount)} unpaid, by days past due`} action={viewAll("/invoices")} noPadding height="100%">
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>Bucket</TableCell><TableCell className="num">Invoices</TableCell><TableCell className="num">Amount</TableCell><TableCell>Share</TableCell></TableRow></TableHead>
                  <TableBody>
                    {d.aging.map((b, i) => (
                      <TableRow key={b.key}>
                        <TableCell sx={{ fontWeight: 500 }}>{b.label}</TableCell>
                        <TableCell className="num">{b.count}</TableCell>
                        <TableCell className="num" sx={{ fontWeight: 600 }}>{formatMoney(b.amount.toFixed(2))}</TableCell>
                        <TableCell><Share value={calc.agingTotal > 0 ? (b.amount / calc.agingTotal) * 100 : 0} color={[CYAN, AMBER, "#FF8A3D", RED, "#B3261E"][i]} /></TableCell>
                      </TableRow>
                    ))}
                    <TableRow sx={{ "& td": { fontWeight: 700, bgcolor: "action.hover" } }}>
                      <TableCell>Total</TableCell><TableCell className="num">{d.aging.reduce((a, b) => a + b.count, 0)}</TableCell>
                      <TableCell className="num">{formatMoney(calc.agingTotal.toFixed(2))}</TableCell><TableCell />
                    </TableRow>
                  </TableBody>
                </Table></Box>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <ChartCard title="Top outstanding clients" subtitle="Largest unpaid balances" action={viewAll("/clients")} noPadding height="100%">
                {d.topDebtors.length === 0 ? <Empty>No client owes anything.</Empty> : (
                  <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                    <TableHead><TableRow><TableCell>Client</TableCell><TableCell className="num">Invoices</TableCell><TableCell className="num">Balance</TableCell><TableCell className="num">Overdue</TableCell><TableCell className="num">Oldest</TableCell></TableRow></TableHead>
                    <TableBody>
                      {d.topDebtors.map((c) => (
                        <LinkRow key={c.clientId} href={`/clients/${c.clientId}`}>
                          <TableCell sx={{ fontWeight: 600, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis" }}>{c.name}</TableCell>
                          <TableCell className="num">{c.invoices}</TableCell>
                          <TableCell className="num" sx={{ fontWeight: 600 }}>{formatMoney(c.balance)}</TableCell>
                          <TableCell className="num" sx={{ color: num(c.overdue) > 0 ? "error.main" : "text.secondary" }}>{num(c.overdue) > 0 ? formatMoney(c.overdue) : "–"}</TableCell>
                          <TableCell className="num">{c.oldestDays > 0 ? `${c.oldestDays}d` : "–"}</TableCell>
                        </LinkRow>
                      ))}
                    </TableBody>
                  </Table></Box>
                )}
              </ChartCard>
            </Grid>
          </Grid>

          {/* GST, pipeline, licences */}
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <ChartCard title="GST summary" subtitle={`Invoices issued ${fmtRange}`} height="100%">
                <StatLine label="Taxable value" value={formatMoney(d.gst.taxable)} />
                <StatLine label="CGST" value={formatMoney(d.gst.cgst)} />
                <StatLine label="SGST" value={formatMoney(d.gst.sgst)} />
                <StatLine label="IGST" value={formatMoney(d.gst.igst)} />
                <StatLine label="Total tax" value={formatMoney(d.gst.tax)} strong />
                <StatLine label="Invoice value" value={formatMoney(d.gst.total)} strong />
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, md: 6, lg: 4 }}>
              <ChartCard title="Sales pipeline" subtitle="Order value by stage" action={viewAll("/sales")} noPadding height="100%">
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>Stage</TableCell><TableCell className="num">Sales</TableCell><TableCell className="num">Value</TableCell><TableCell>Share</TableCell></TableRow></TableHead>
                  <TableBody>
                    {(["draft", "confirmed", "completed"] as const).map((st) => {
                      const r = d.pipeline.find((p) => p.status === st);
                      return (
                        <TableRow key={st}>
                          <TableCell sx={{ fontWeight: 500, textTransform: "capitalize" }}>{st}</TableCell>
                          <TableCell className="num">{r?.count ?? 0}</TableCell>
                          <TableCell className="num" sx={{ fontWeight: 600 }}>{compactInr(num(r?.value ?? 0))}</TableCell>
                          <TableCell><Share value={calc.pipeTotal > 0 ? (num(r?.value ?? 0) / calc.pipeTotal) * 100 : 0} color={STATUS_COLOR[st]} /></TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow sx={{ "& td": { fontWeight: 700, bgcolor: "action.hover" } }}>
                      <TableCell>Total</TableCell><TableCell className="num">{d.pipeline.reduce((a, b) => a + b.count, 0)}</TableCell><TableCell className="num">{compactInr(calc.pipeTotal)}</TableCell><TableCell />
                    </TableRow>
                  </TableBody>
                </Table></Box>
                <Box sx={{ px: 2, py: 1.5 }}>
                  <Typography variant="caption" color="text.secondary">Still to bill on confirmed sales: </Typography>
                  <Typography variant="caption" sx={{ fontWeight: 700 }}>{formatMoney(d.sales.toBill)}</Typography>
                </Box>
              </ChartCard>
            </Grid>
            <Grid size={{ xs: 12, lg: 4 }}>
              <ChartCard title="Licence health" subtitle={`${formatMoney(d.licenses.renewals30.expectedValue)} renewing in 30 days`} action={viewAll("/licenses")} height="100%">
                <CommonPieChart type="donut" compact showExport={false} height={210} legend="bottom" valueFormatter={(v) => String(Math.round(v))}
                  labels={["Active", "Expiring ≤30d", "Expired", "Pending", "Suspended"]}
                  values={[Math.max(d.licenses.active - d.licenses.expiring30, 0), d.licenses.expiring30, d.licenses.expired, d.licenses.pending, d.licenses.suspended]}
                  colors={[GREEN, AMBER, RED, CYAN, GREY]} />
              </ChartCard>
            </Grid>
          </Grid>

          {/* Tabbed activity tables */}
          <Card sx={{ borderRadius: "16px", overflow: "hidden" }}>
            <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: 1, borderColor: "divider", pr: { xs: 0, sm: 2 } }}>
              <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ px: 1 }}>
                {tabs.map((t) => <Tab key={t.label} label={`${t.label} (${t.count})`} sx={{ minHeight: 46, fontSize: "0.8125rem" }} />)}
              </Tabs>
              {tabs[tab]?.href && <Box sx={{ display: { xs: "none", sm: "block" } }}>{viewAll(tabs[tab].href)}</Box>}
            </Box>
            <Box sx={{ minHeight: 280, overflowX: "auto" }}>
              {tab === 0 && (d.recentInvoices.length === 0 ? <Empty>No invoices yet.</Empty> : (
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>Invoice</TableCell><TableCell>Client</TableCell><TableCell>Date</TableCell><TableCell>Status</TableCell><TableCell className="num">Amount</TableCell></TableRow></TableHead>
                  <TableBody>
                    {d.recentInvoices.map((i) => (
                      <LinkRow key={String(i.id)} href={`/invoices/${i.id}`}>
                        <TableCell sx={{ fontWeight: 600 }}>{String(i.invoice_number ?? "Draft")}</TableCell>
                        <TableCell>{String(i.client_name)}</TableCell>
                        <TableCell>{format(parseISO(String(i.issue_date)), "dd MMM yyyy")}</TableCell>
                        <TableCell><Chip size="small" variant={i.paid ? "filled" : "outlined"} color={i.paid ? "success" : i.status === "issued" ? "info" : "default"} label={i.status === "issued" ? (i.paid ? "Paid" : "Issued") : String(i.status)} sx={{ height: 20, fontSize: "0.7rem", textTransform: "capitalize" }} /></TableCell>
                        <TableCell className="num" sx={{ fontWeight: 600 }}>{formatMoney(String(i.total))}</TableCell>
                      </LinkRow>
                    ))}
                  </TableBody>
                </Table></Box>
              ))}
              {tab === 1 && (d.recentPayments.length === 0 ? <Empty>No payments recorded yet.</Empty> : (
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>Receipt</TableCell><TableCell>Client</TableCell><TableCell>Date</TableCell><TableCell>Method</TableCell><TableCell className="num">Amount</TableCell></TableRow></TableHead>
                  <TableBody>
                    {d.recentPayments.map((p) => (
                      <LinkRow key={p.id} href={`/payments/${p.id}`}>
                        <TableCell sx={{ fontWeight: 600 }}>{p.receiptNumber}</TableCell><TableCell>{p.clientName}</TableCell>
                        <TableCell>{format(parseISO(p.date), "dd MMM yyyy")}</TableCell><TableCell>{p.method}</TableCell>
                        <TableCell className="num" sx={{ fontWeight: 600, color: "success.main" }}>{formatMoney(p.amount)}</TableCell>
                      </LinkRow>
                    ))}
                  </TableBody>
                </Table></Box>
              ))}
              {tab === 2 && (d.upcomingDues.length === 0 ? <Empty>Nothing falls due in the next two weeks.</Empty> : (
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>Invoice</TableCell><TableCell>Client</TableCell><TableCell>Due date</TableCell><TableCell>Due in</TableCell><TableCell className="num">Balance</TableCell></TableRow></TableHead>
                  <TableBody>
                    {d.upcomingDues.map((u) => (
                      <LinkRow key={u.id} href={`/invoices/${u.id}`}>
                        <TableCell sx={{ fontWeight: 600 }}>{u.invoiceNumber}</TableCell><TableCell>{u.clientName}</TableCell>
                        <TableCell>{format(parseISO(u.dueDate), "dd MMM yyyy")}</TableCell>
                        <TableCell><Chip size="small" color={u.days <= 2 ? "warning" : "default"} label={u.days === 0 ? "Today" : `${u.days} day${u.days === 1 ? "" : "s"}`} sx={{ height: 20, fontSize: "0.7rem" }} /></TableCell>
                        <TableCell className="num" sx={{ fontWeight: 600 }}>{formatMoney(u.balance)}</TableCell>
                      </LinkRow>
                    ))}
                  </TableBody>
                </Table></Box>
              ))}
              {tab === 3 && (d.expiringLicenses.length === 0 ? <Empty>No licences are due for renewal in the next 30 days.</Empty> : (
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>Licence</TableCell><TableCell>Client</TableCell><TableCell>Product</TableCell><TableCell>Expires</TableCell><TableCell>Status</TableCell><TableCell className="num">Renewal</TableCell></TableRow></TableHead>
                  <TableBody>
                    {d.expiringLicenses.map((l) => {
                      const days = Number(l.days_remaining);
                      return (
                        <LinkRow key={String(l.id)} href={`/licenses/${l.id}`}>
                          <TableCell sx={{ fontWeight: 600 }}>{String(l.license_identifier)}</TableCell><TableCell>{String(l.client_name)}</TableCell><TableCell>{String(l.product_name)}</TableCell>
                          <TableCell>{format(parseISO(String(l.expiry_date)), "dd MMM yyyy")}</TableCell>
                          <TableCell><Chip size="small" color={days < 0 ? "error" : days <= 7 ? "warning" : "default"} label={days < 0 ? `${-days}d overdue` : `${days}d left`} sx={{ height: 20, fontSize: "0.7rem" }} /></TableCell>
                          <TableCell className="num">{l.renewal_price ? formatMoney(String(l.renewal_price)) : "–"}</TableCell>
                        </LinkRow>
                      );
                    })}
                  </TableBody>
                </Table></Box>
              ))}
              {tab === 4 && (d.recentActivity.length === 0 ? <Empty>Nothing has happened yet.</Empty> : (
                <Box sx={{ overflowX: "auto" }}><Table size="small" sx={tableSx}>
                  <TableHead><TableRow><TableCell>When</TableCell><TableCell>User</TableCell><TableCell>Activity</TableCell></TableRow></TableHead>
                  <TableBody>
                    {d.recentActivity.map((a) => (
                      <TableRow key={String(a.id)} hover>
                        <TableCell>{format(new Date(String(a.created_at)), "dd MMM, hh:mm a")}</TableCell>
                        <TableCell>{String(a.actor_name ?? "System")}</TableCell>
                        <TableCell sx={{ whiteSpace: "normal !important" }}>{String(a.summary)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table></Box>
              ))}
            </Box>
          </Card>
        </Box>
      )}
      {paying && <RecordPaymentDialog onClose={() => setPaying(false)} onSaved={() => { setPaying(false); reload(); }} />}
    </>
  );
}
