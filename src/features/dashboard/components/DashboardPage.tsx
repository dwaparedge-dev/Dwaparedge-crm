"use client";
import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import { format, parseISO } from "date-fns";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { RANGE_PRESETS, presetRange, type RangePreset } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import { RecordPaymentDialog } from "@/features/payments/components/RecordPaymentDialog";
import type { getDashboard } from "../service";

type Data = Awaited<ReturnType<typeof getDashboard>>;
type Tone = "default" | "error" | "warning" | "success" | "info";

function Stat({ label, value, note, href, tone = "default" }: { label: string; value: string; note: string; href?: string; tone?: Tone }) {
  const color = tone === "default" ? "text.primary" : `${tone}.main`;
  const body = (
    <CardContent>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="h5" component="div" sx={{ fontWeight: 700, color, my: 0.5 }}>{value}</Typography>
      <Typography variant="caption" color="text.secondary">{note}</Typography>
    </CardContent>
  );
  return (
    <Card sx={{ height: "100%", ...(href ? { "&:hover": { borderColor: "primary.main" } } : {}) }}>
      {href ? <Box component={Link} href={href} sx={{ display: "block", color: "inherit", textDecoration: "none", height: "100%" }}>{body}</Box> : body}
    </Card>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      {subtitle && <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{subtitle}</Typography>}
      <Grid container spacing={2} sx={{ mt: subtitle ? 0 : 1 }}>{children}</Grid>
    </Box>
  );
}
const Cell = ({ children }: { children: React.ReactNode }) => <Grid size={{ xs: 12, sm: 6, lg: 3 }}>{children}</Grid>;

export function DashboardPage() {
  const router = useRouter();
  const [preset, setPreset] = useState<RangePreset | "custom">("this_month");
  const [range, setRange] = useState<[string, string]>(() => presetRange("this_month"));
  const [paying, setPaying] = useState(false);
  const { data: d, error, loading, reload } = useFetch<Data>(`/api/dashboard?from=${range[0]}&to=${range[1]}`);

  const rangeValid = range[0] && range[1] && range[0] <= range[1];
  const fmtRange = `${format(parseISO(range[0]), "dd MMM yyyy")} – ${format(parseISO(range[1]), "dd MMM yyyy")}`;

  return (
    <>
      <PageHeader
        title="Dashboard"
        actions={
          <>
            <Button component={Link} href="/clients/new" variant="outlined" startIcon={<AddIcon />}>Add client</Button>
            <Button component={Link} href="/invoices/new" variant="outlined" startIcon={<AddIcon />}>Create invoice</Button>
            <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setPaying(true)}>Record payment</Button>
            <Button component={Link} href="/licenses/new" variant="outlined" startIcon={<AddIcon />}>Issue license</Button>
          </>
        }
      />
      <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", mb: 3, alignItems: "center" }}>
        <TextField select size="small" label="Period" value={preset} sx={{ minWidth: 190 }}
          onChange={(e) => { const v = e.target.value as RangePreset | "custom"; setPreset(v); if (v !== "custom") setRange(presetRange(v)); }}>
          {RANGE_PRESETS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
          <MenuItem value="custom">Custom range</MenuItem>
        </TextField>
        <TextField size="small" type="date" label="From" value={range[0]} slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => { setPreset("custom"); setRange([e.target.value, range[1]]); }} />
        <TextField size="small" type="date" label="To" value={range[1]} slotProps={{ inputLabel: { shrink: true } }} onChange={(e) => { setPreset("custom"); setRange([range[0], e.target.value]); }} />
        {!rangeValid && <Typography color="error" variant="body2">The start date must be on or before the end date.</Typography>}
      </Box>

      {error ? <ErrorState message={error} onRetry={reload} /> : !d ? (
        <Grid container spacing={2}>{Array.from({ length: 8 }, (_, i) => <Cell key={i}><Skeleton variant="rounded" height={110} /></Cell>)}</Grid>
      ) : (
        <Box sx={{ opacity: loading ? 0.6 : 1 }}>
          <Box sx={{ display: "grid", gap: 1, mb: 3 }}>
            {d.billing.overdue.invoices > 0 && (
              <Alert severity="warning" action={<Button color="inherit" size="small" component={Link} href="/reports/overdue">View</Button>}>
                {d.billing.overdue.invoices} overdue invoice{d.billing.overdue.invoices === 1 ? "" : "s"} totalling {formatMoney(d.billing.overdue.amount)}.
              </Alert>
            )}
            {d.licenses.expired > 0 && (
              <Alert severity="error" action={<Button color="inherit" size="small" component={Link} href="/licenses">View</Button>}>
                {d.licenses.expired} license{d.licenses.expired === 1 ? " has" : "s have"} expired and not been renewed.
              </Alert>
            )}
            {d.licenses.expiring7 > 0 && (
              <Alert severity="info" action={<Button color="inherit" size="small" component={Link} href="/reports/renewals">View</Button>}>
                {d.licenses.expiring7} license{d.licenses.expiring7 === 1 ? "" : "s"} expiring within 7 days.
              </Alert>
            )}
          </Box>

          <Section title="Clients & sales">
            <Cell><Stat label="Active clients" value={String(d.clients.active)} note="Not archived and marked active" href="/clients" /></Cell>
            <Cell><Stat label="Open sales" value={String(d.sales.open)} note={`Draft or confirmed · estimated ${formatMoney(d.sales.value)} incl. GST (not yet invoiced)`} href="/sales" /></Cell>
          </Section>

          <Section title="Billing in the selected period" subtitle={`${fmtRange}. Invoiced and collected are independent: collected is money actually received, not derived from invoices.`}>
            <Cell><Stat label="Invoiced" value={formatMoney(d.billing.invoiced.amount)} note={`${d.billing.invoiced.count} issued invoice${d.billing.invoiced.count === 1 ? "" : "s"} dated in the period`} href="/reports/invoices" /></Cell>
            <Cell><Stat label="Collected" value={formatMoney(d.billing.collected.amount)} note={`${d.billing.collected.count} payment${d.billing.collected.count === 1 ? "" : "s"} received in the period (excl. voided)`} tone="success" href="/reports/payments" /></Cell>
          </Section>

          <Section title="Receivables right now" subtitle="As of today, regardless of the period above. Based on payments allocated to invoices.">
            <Cell><Stat label="Outstanding" value={formatMoney(d.billing.outstanding.amount)} note={`Unpaid balance on ${d.billing.outstanding.invoices} issued invoice${d.billing.outstanding.invoices === 1 ? "" : "s"}`} tone="warning" href="/reports/outstanding" /></Cell>
            <Cell><Stat label="Overdue" value={formatMoney(d.billing.overdue.amount)} note={`${d.billing.overdue.invoices} invoice${d.billing.overdue.invoices === 1 ? "" : "s"} past the due date`} tone={d.billing.overdue.invoices ? "error" : "default"} href="/reports/overdue" /></Cell>
            <Cell><Stat label="Still to bill on confirmed sales" value={formatMoney(d.sales.toBill)} note={`${d.sales.salesToBill} sale${d.sales.salesToBill === 1 ? "" : "s"} with work not yet invoiced. Estimate incl. GST; not billed or collected`} href="/reports/salebilling" /></Cell>
            <Cell><Stat label="Advances on account" value={formatMoney(d.billing.advances)} note="Received but not yet allocated to an invoice" href="/payments" /></Cell>
          </Section>

          <Section title="Software licenses">
            <Cell><Stat label="Active licenses" value={String(d.licenses.active)} note={`${d.licenses.pending} pending · ${d.licenses.suspended} suspended`} href="/licenses" /></Cell>
            <Cell><Stat label="Expiring in 7 / 15 / 30 days" value={`${d.licenses.expiring7} / ${d.licenses.expiring15} / ${d.licenses.expiring30}`} note="Cumulative: the 30-day count includes the 7- and 15-day ones" tone={d.licenses.expiring7 ? "warning" : "default"} href="/reports/renewals" /></Cell>
            <Cell><Stat label="Expired, not renewed" value={String(d.licenses.expired)} note="Active licenses past their expiry date" tone={d.licenses.expired ? "error" : "default"} href="/licenses" /></Cell>
            <Cell><Stat label="Projected renewal value" value={formatMoney(d.licenses.renewals30.expectedValue)} note={`${d.licenses.renewals30.count} license${d.licenses.renewals30.count === 1 ? "" : "s"} expiring within 30 days or already expired. Projection only: not invoiced or collected.`} href="/reports/renewals" /></Cell>
          </Section>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Licenses to renew (next 30 days)</Typography>
                  {d.expiringLicenses.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>No licenses are due for renewal in the next 30 days.</Typography> : (
                    <List disablePadding>
                      {d.expiringLicenses.map((l) => (
                        <ListItem key={String(l.id)} divider disableGutters secondaryAction={<Chip size="small" color={Number(l.days_remaining) < 0 ? "error" : Number(l.days_remaining) <= 7 ? "warning" : "default"} label={Number(l.days_remaining) < 0 ? `${-Number(l.days_remaining)}d overdue` : `${l.days_remaining}d`} />}>
                          <ListItemText primary={<Link href={`/licenses/${l.id}`} style={{ color: "inherit" }}>{String(l.client_name)} · {String(l.product_name)}</Link>} secondary={`${l.license_identifier} · expires ${format(parseISO(String(l.expiry_date)), "dd MMM yyyy")}${l.renewal_price ? ` · ${formatMoney(String(l.renewal_price))}` : ""}`} />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={{ xs: 12, lg: 6 }}>
              <Card sx={{ height: "100%" }}>
                <CardContent>
                  <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Recent invoices</Typography>
                  {d.recentInvoices.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>No invoices yet.</Typography> : (
                    <List disablePadding>
                      {d.recentInvoices.map((i) => (
                        <ListItem key={String(i.id)} divider disableGutters secondaryAction={<Typography variant="body2">{formatMoney(String(i.total))}</Typography>}>
                          <ListItemText primary={<Link href={`/invoices/${i.id}`} style={{ color: "inherit" }}>{String(i.invoice_number ?? "Draft")} · {String(i.client_name)}</Link>}
                            secondary={`${format(parseISO(String(i.issue_date)), "dd MMM yyyy")} · ${i.status === "issued" ? (i.paid ? "Paid" : "Issued") : String(i.status)}`} />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
            <Grid size={12}>
              <Card>
                <CardContent>
                  <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>Recent activity</Typography>
                    <Button size="small" component={Link} href="/reports/activity">View all</Button>
                  </Box>
                  {d.recentActivity.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>Nothing has happened yet.</Typography> : (
                    <List disablePadding>
                      {d.recentActivity.map((a) => (
                        <ListItem key={String(a.id)} divider disableGutters>
                          <ListItemText primary={String(a.summary)} secondary={`${a.actor_name ?? "System"} · ${format(new Date(String(a.created_at)), "dd MMM yyyy, hh:mm a")}`} />
                        </ListItem>
                      ))}
                    </List>
                  )}
                </CardContent>
              </Card>
            </Grid>
          </Grid>
        </Box>
      )}
      {paying && <RecordPaymentDialog onClose={() => setPaying(false)} onSaved={(id) => { setPaying(false); router.push(`/payments/${id}`); }} />}
    </>
  );
}
