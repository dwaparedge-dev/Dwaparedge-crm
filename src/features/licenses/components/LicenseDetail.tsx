"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Skeleton from "@mui/material/Skeleton";
import { LicenseFormDialog } from "./LicenseFormDialog";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import TextField from "@mui/material/TextField";
import { format, parseISO } from "date-fns";
import { useNotify } from "@/components/common/Notify";
import { InfoBox, SectionLabel } from "@/components/common/InfoBox";
import { DetailTabPanel, DetailViewHeroSidebar, DetailViewLayout, DetailViewMetricStrip, DetailViewTabs, MasterStatusBadge } from "@/components/shared/DetailView";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import HistoryIcon from "@mui/icons-material/HistoryOutlined";
import VerifiedIcon from "@mui/icons-material/VerifiedOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import { ErrorState } from "@/components/common/states";
import { HeroActions } from "@/components/common/HeroActions";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { suggestRenewalExpiry } from "@/lib/dates";
import { formatMoney } from "@/lib/format";
import type { LicenseEventRow, LicenseRow } from "../service";
import { DaysRemaining } from "./common";

type Detail = LicenseRow & { events: LicenseEventRow[] };
type ActionName = "activate" | "renew" | "suspend" | "reinstate" | "revoke";

const COPY: Record<ActionName, { title: string; text: string; label: string; reason?: boolean; destructive?: boolean }> = {
  activate: { title: "Activate license", text: "The license becomes active from today.", label: "Activate" },
  renew: { title: "Renew license", text: "Choose the new expiry date. The previous expiry is kept in the history.", label: "Renew" },
  suspend: { title: "Suspend license", text: "The license stays on record but is marked suspended. You can reinstate it later.", label: "Suspend", reason: true, destructive: true },
  reinstate: { title: "Reinstate license", text: "The license returns to active.", label: "Reinstate" },
  revoke: { title: "Revoke license", text: "Revoking is permanent: a revoked license can't be reactivated, renewed or edited. Its history is kept.", label: "Revoke permanently", reason: true, destructive: true },
};
const DONE: Record<ActionName, string> = { activate: "License activated", renew: "License renewed", suspend: "License suspended", reinstate: "License reinstated", revoke: "License revoked" };
const EVENT_LABEL: Record<string, string> = { issued: "Issued", activated: "Activated", renewed: "Renewed", suspended: "Suspended", reinstated: "Reinstated", revoked: "Revoked", updated: "Details updated" };

function ActionDialog({ license, action, onClose, onDone }: { license: Detail; action: ActionName; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const copy = COPY[action];
  const [note, setNote] = useState("");
  const [newExpiry, setNewExpiry] = useState(suggestRenewalExpiry(license.expiry_date, 12));
  const [price, setPrice] = useState(license.renewal_price ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body: Record<string, unknown> = { action, note };
      if (action === "renew") Object.assign(body, { newExpiry, renewalPrice: price });
      await api(`/api/licenses/${license.id}/action`, { method: "POST", body });
      notify.success(DONE[action]);
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{copy.title}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <DialogContentText>{copy.text}</DialogContentText>
        {error && <Alert severity="error">{error}</Alert>}
        {action === "renew" && (
          <>
            <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
              {[1, 3, 6, 12, 24].map((m) => (
                <Button key={m} size="small" variant="outlined" onClick={() => setNewExpiry(suggestRenewalExpiry(license.expiry_date, m))}>+{m} mo</Button>
              ))}
            </Box>
            <TextField label="New expiry date" type="date" required value={newExpiry} onChange={(e) => setNewExpiry(e.target.value)} slotProps={{ inputLabel: { shrink: true } }}
              helperText={`Current expiry: ${format(parseISO(license.expiry_date), "dd MMM yyyy")}. Suggested dates count from the later of that and today.`} />
            <TextField label="Renewal price (₹)" value={price} onChange={(e) => setPrice(e.target.value)} inputMode="decimal" helperText="Leave unchanged to keep the current renewal price" />
          </>
        )}
        <TextField label={copy.reason ? "Reason (required)" : "Note (optional)"} required={copy.reason} multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" color={copy.destructive ? "error" : "primary"} onClick={submit} disabled={busy || (copy.reason && note.trim().length < 3) || (action === "renew" && !newExpiry)}>
          {busy ? "Working…" : copy.label}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

function describe(e: LicenseEventRow): string | null {
  const d = e.details ?? {};
  if (e.event_type === "renewed") return `Expiry ${d.oldExpiry} → ${d.newExpiry}${d.renewalPrice ? ` · renewal price ${formatMoney(String(d.renewalPrice))}` : ""}`;
  if (e.event_type === "issued") return `Expires ${d.expiryDate}`;
  return null;
}

export function LicenseDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: l, error, loading, reload } = useFetch<Detail>(`/api/licenses/${id}`);
  const [action, setAction] = useState<ActionName | null>(null);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState(0);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !l) return <><Skeleton width={300} height={40} /><Skeleton variant="rounded" height={300} sx={{ mt: 2 }} /></>;

  const s = l.stored_status;
  const canRenew = s === "active"; // includes expired (active past its date)
  const days = l.days_remaining;
  const tabs = [
    { key: "overview", label: "Overview", icon: <InfoIcon sx={{ fontSize: 18 }} /> },
    { key: "history", label: "History", icon: <HistoryIcon sx={{ fontSize: 18 }} />, count: l.events.length || undefined },
  ];
  const badgeKey = { pending: "pending", active: "active", expired: "warning", suspended: "maintenance", revoked: "inactive" }[l.status] ?? "info";
  return (
    <>
      <DetailViewLayout
        onBack={() => router.push("/licenses")}
        backLabel="Back to Licenses"
        sidebar={
          <DetailViewHeroSidebar
            onBack={() => router.push("/licenses")}
            backLabel="Back to Licenses"
            title={l.license_identifier}
            titleLabel="License identifier"
            subtitle={l.product_name}
            subtitleLabel="Product"
            copyValue={l.license_identifier}
            avatarIcon={<VerifiedIcon sx={{ fontSize: 32 }} />}
            badges={<MasterStatusBadge status={badgeKey} customLabel={l.status.charAt(0).toUpperCase() + l.status.slice(1)} />}
            attributes={[
              { label: "Client", value: <Link href={`/clients/${l.client_id}`}>{l.client_name}</Link> },
              { label: "Plan", value: <OptionLabel table="licenses" column="plan" value={l.plan} /> },
              { label: "Seat limit", value: l.seat_limit ?? "Unlimited" },
              { label: "Start date", value: format(parseISO(l.start_date), "dd MMM yyyy") },
              { label: "Expiry date", value: format(parseISO(l.expiry_date), "dd MMM yyyy") },
              { label: "Activated", value: l.activated_at ? format(new Date(l.activated_at), "dd MMM yyyy") : "—" },
            ]}
            actions={
              <HeroActions>
                {s === "pending" && <Button fullWidth variant="contained" onClick={() => setAction("activate")}>Activate</Button>}
                {canRenew && <Button fullWidth variant="contained" onClick={() => setAction("renew")}>Renew</Button>}
                {s === "suspended" && <Button fullWidth variant="contained" onClick={() => setAction("reinstate")}>Reinstate</Button>}
                {s !== "revoked" && <Button fullWidth variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit license</Button>}
                {s === "active" && <Button fullWidth variant="outlined" color="warning" onClick={() => setAction("suspend")}>Suspend</Button>}
                {s !== "revoked" && <Button fullWidth variant="outlined" color="error" onClick={() => setAction("revoke")}>Revoke</Button>}
              </HeroActions>
            }
          />
        }
        metricStrip={
          <DetailViewMetricStrip
            columns={4}
            metrics={[
              { label: "Days remaining", value: <DaysRemaining expiry={l.expiry_date} status={l.status} />, subtitle: `expires ${format(parseISO(l.expiry_date), "dd MMM yyyy")}`, color: l.status === "expired" ? "#ef4444" : days <= 30 && l.status === "active" ? "#f59e0b" : undefined },
              { label: "Renewal price", value: l.renewal_price ? formatMoney(l.renewal_price) : "—", subtitle: "projected on renewal" },
              { label: "Seats", value: l.seat_limit ?? "Unlimited", subtitle: "user limit" },
              { label: "Status", value: l.status.charAt(0).toUpperCase() + l.status.slice(1), subtitle: "current state" },
            ]}
          />
        }
      >
        {l.status === "expired" && <Alert severity="warning" sx={{ mb: 2 }}>This license expired on {format(parseISO(l.expiry_date), "dd MMM yyyy")}. Renew it to make it active again.</Alert>}
        {l.status === "pending" && <Alert severity="info" sx={{ mb: 2 }}>This license has been issued but is not active yet.</Alert>}
        <DetailViewTabs tabs={tabs} activeTab={tab} onChange={setTab}>
          <DetailTabPanel value={tab} index={0}>
            <SectionLabel>License</SectionLabel>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Client"><Link href={`/clients/${l.client_id}`}>{l.client_name}</Link></InfoBox></Grid>
              <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Product">{l.product_name}</InfoBox></Grid>
              <Grid size={{ xs: 6, md: 4 }}><InfoBox label="Plan"><OptionLabel table="licenses" column="plan" value={l.plan} /></InfoBox></Grid>
              <Grid size={{ xs: 6, md: 4 }}><InfoBox label="Seat limit">{l.seat_limit ?? "Unlimited"}</InfoBox></Grid>
              <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Days remaining"><DaysRemaining expiry={l.expiry_date} status={l.status} /></InfoBox></Grid>
              <Grid size={{ xs: 6, md: 4 }}><InfoBox label="Start date">{format(parseISO(l.start_date), "dd MMM yyyy")}</InfoBox></Grid>
              <Grid size={{ xs: 6, md: 4 }}><InfoBox label="Expiry date">{format(parseISO(l.expiry_date), "dd MMM yyyy")}</InfoBox></Grid>
              <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Activated">{l.activated_at ? format(new Date(l.activated_at), "dd MMM yyyy") : null}</InfoBox></Grid>
            </Grid>
            <SectionLabel>Renewal</SectionLabel>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Renewal price">{l.renewal_price ? formatMoney(l.renewal_price) : null}</InfoBox></Grid>
              <Grid size={{ xs: 12, md: 8 }}><InfoBox label="Renewal terms">{l.renewal_terms}</InfoBox></Grid>
              <Grid size={12}><InfoBox label="Notes">{l.notes}</InfoBox></Grid>
            </Grid>
          </DetailTabPanel>
          <DetailTabPanel value={tab} index={1}>
            <List disablePadding>
              {l.events.map((e) => (
                <ListItem key={e.id} divider disableGutters alignItems="flex-start">
                  <ListItemText
                    primary={EVENT_LABEL[e.event_type] ?? e.event_type}
                    secondary={
                      <>
                        {[describe(e), e.note && `“${e.note}”`].filter(Boolean).map((t) => <Box key={t} component="span" sx={{ display: "block" }}>{t}</Box>)}
                        <Box component="span" sx={{ display: "block" }}>{e.actor_name ?? "System"} · {format(new Date(e.created_at), "dd MMM yyyy, hh:mm a")}</Box>
                      </>
                    }
                    slotProps={{ primary: { sx: { fontWeight: 600 } }, secondary: { component: "div" } }}
                  />
                </ListItem>
              ))}
            </List>
          </DetailTabPanel>
        </DetailViewTabs>
      </DetailViewLayout>
      {action && <ActionDialog license={l} action={action} onClose={() => setAction(null)} onDone={() => { setAction(null); reload(); }} />}
      {editing && <LicenseFormDialog licenseId={id} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
