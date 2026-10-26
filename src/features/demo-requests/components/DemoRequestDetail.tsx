"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import ContactPhoneIcon from "@mui/icons-material/ContactPhoneOutlined";
import EmailIcon from "@mui/icons-material/EmailOutlined";
import HistoryIcon from "@mui/icons-material/HistoryOutlined";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import PhoneIcon from "@mui/icons-material/PhoneOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import { HeroActions } from "@/components/common/HeroActions";
import { InfoBox, SectionLabel } from "@/components/common/InfoBox";
import { useNotify } from "@/components/common/Notify";
import { EmptyState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import {
  DetailTabPanel, DetailViewHeroSidebar, DetailViewLayout, DetailViewMetricStrip, DetailViewTabs, MasterStatusBadge,
  type MasterStatusType,
} from "@/components/shared/DetailView";
import { api } from "@/lib/api-client";
import type { DemoRequestStatus } from "../schema";
import type { DemoRequestEventRow, DemoRequestRow } from "../service";
import { announceDemoRequestsChanged } from "../useNewDemoRequestCount";
import { STATUS_LABEL, describeSource, formatMobile } from "./common";

export type DemoRequestDetailData = DemoRequestRow & { events: DemoRequestEventRow[] };
export interface StaffOption { id: string; name: string }

const WORKFLOW = ["new", "contacted", "scheduled", "done"] as const;
const BADGE: Record<DemoRequestStatus, MasterStatusType> = { new: "info", contacted: "pending", scheduled: "maintenance", done: "completed", spam: "inactive" };
const when = (v: string) => format(new Date(v), "dd MMM yyyy, hh:mm a");

/** Owner and notes: the part of a request staff fill in as they work it. */
function FollowUp({ request: r, staff, onSaved }: { request: DemoRequestDetailData; staff: StaffOption[]; onSaved: () => void }) {
  const notify = useNotify();
  const [owner, setOwner] = useState(r.owner_id ?? "");
  const [notes, setNotes] = useState(r.notes ?? "");
  const [busy, setBusy] = useState(false);

  // A request can be owned by someone who has since been deactivated: keep them selectable so the box is not blank.
  const owners = r.owner_id && !staff.some((s) => s.id === r.owner_id) ? [...staff, { id: r.owner_id, name: r.owner_name ?? "Former staff member" }] : staff;
  const ownerChanged = owner !== (r.owner_id ?? "");
  const notesChanged = notes.trim() !== (r.notes ?? "");

  async function save() {
    setBusy(true);
    try {
      await api(`/api/demo-requests/${r.id}`, { method: "PATCH", body: { ...(ownerChanged ? { ownerId: owner } : {}), ...(notesChanged ? { notes } : {}) } });
      notify.success("Saved");
      onSaved();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <TextField id="demo-owner" select size="small" label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} disabled={busy} sx={{ maxWidth: 320 }}>
        <MenuItem value="">Unassigned</MenuItem>
        {owners.map((s) => <MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}
      </TextField>
      <TextField id="demo-notes" label="Notes" multiline minRows={4} value={notes} onChange={(e) => setNotes(e.target.value)} disabled={busy}
        placeholder="What was said, when to call back, what they use today…" helperText={`${notes.length} / 5000`} slotProps={{ htmlInput: { maxLength: 5000 } }} />
      <Box><Button id="demo-save" variant="contained" disabled={busy || (!ownerChanged && !notesChanged)} onClick={save}>{busy ? "Saving…" : "Save changes"}</Button></Box>
    </Box>
  );
}

/** One request laid out like every other record page: summary panel, key figures, then Overview and History tabs. */
export function DemoRequestPage({ request: r, staff, onBack, onChanged }: { request: DemoRequestDetailData; staff: StaffOption[]; onBack: () => void; onChanged: () => void }) {
  const notify = useNotify();
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);
  const spam = r.status === "spam";
  const eventCount = r.events.length;
  const tabs = useMemo(() => [
    { key: "overview", label: "Overview", icon: <InfoIcon sx={{ fontSize: 18 }} /> },
    { key: "history", label: "Activity History", icon: <HistoryIcon sx={{ fontSize: 18 }} />, count: eventCount || undefined },
  ], [eventCount]);

  async function setStatus(status: DemoRequestStatus) {
    setBusy(true);
    try {
      await api(`/api/demo-requests/${r.id}/status`, { method: "POST", body: { status } });
      notify.success(`Marked ${STATUS_LABEL[status].toLowerCase()}`);
      onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DetailViewLayout
      onBack={onBack}
      backLabel="Back to Demo Requests"
      headerTitle={r.name}
      headerSubtitle={r.company}
      sidebar={
        <DetailViewHeroSidebar
          onBack={onBack}
          backLabel="Back to Demo Requests"
          title={r.name}
          subtitle={r.company}
          subtitleLabel="Company"
          avatarIcon={<ContactPhoneIcon sx={{ fontSize: 32 }} />}
          badges={<MasterStatusBadge status={BADGE[r.status]} customLabel={STATUS_LABEL[r.status]} />}
          attributes={[
            { label: "Mobile", value: formatMobile(r.mobile) },
            { label: "Email", value: r.email },
            { label: "Owner", value: r.owner_name ?? "Unassigned" },
            { label: "Received", value: when(r.created_at) },
            { label: "Came from", value: describeSource(r.source, r.entry_point) },
          ]}
          actions={
            <HeroActions>
              <Button id="demo-call" fullWidth variant="contained" startIcon={<PhoneIcon />} href={`tel:+91${r.mobile}`}>Call {formatMobile(r.mobile)}</Button>
              <Button id="demo-whatsapp" fullWidth variant="outlined" startIcon={<WhatsAppIcon />} href={`https://wa.me/91${r.mobile}`} target="_blank" rel="noopener noreferrer">WhatsApp</Button>
              <Button id="demo-email" fullWidth variant="outlined" startIcon={<EmailIcon />} href={`mailto:${r.email}`}>Email</Button>
              {spam
                ? <Button id="demo-not-spam" fullWidth variant="outlined" disabled={busy} onClick={() => setStatus("new")}>Not spam, reopen</Button>
                : <Button id="demo-mark-spam" fullWidth variant="outlined" color="error" disabled={busy} onClick={() => setStatus("spam")}>Mark as spam</Button>}
            </HeroActions>
          }
        />
      }
      metricStrip={
        <DetailViewMetricStrip
          columns={4}
          metrics={[
            { label: "Status", value: STATUS_LABEL[r.status], subtitle: r.owner_name ? `owned by ${r.owner_name}` : "no owner yet" },
            { label: "Received", value: format(new Date(r.created_at), "dd MMM yyyy"), subtitle: format(new Date(r.created_at), "hh:mm a") },
            r.contacted_at
              ? { label: "First contacted", value: format(new Date(r.contacted_at), "dd MMM yyyy"), subtitle: format(new Date(r.contacted_at), "hh:mm a"), color: "#10b981" }
              : { label: "First contacted", value: "Not yet", subtitle: spam ? "marked as spam" : "waiting for a first call", color: spam ? undefined : "#f59e0b" },
            { label: "Asked again", value: r.repeat_count === 0 ? "No" : `${r.repeat_count} time${r.repeat_count === 1 ? "" : "s"}`, subtitle: r.repeat_count === 0 ? "asked only once" : `last ${format(new Date(r.last_submitted_at), "dd MMM, hh:mm a")}` },
          ]}
        />
      }
    >
      <DetailViewTabs tabs={tabs} activeTab={tab} onChange={setTab}>
        <DetailTabPanel value={tab} index={0}>
          <SectionLabel>Status</SectionLabel>
          {spam ? (
            <Alert severity="warning">Marked as spam, so it is hidden from the main list. Use “Not spam, reopen” in the left panel to bring it back.</Alert>
          ) : (
            <ToggleButtonGroup exclusive size="small" color="primary" value={r.status} disabled={busy} aria-label="Status"
              onChange={(_, value: DemoRequestStatus | null) => { if (value && value !== r.status) void setStatus(value); }}>
              {WORKFLOW.map((s) => <ToggleButton key={s} id={`demo-status-${s}`} value={s} sx={{ px: 2.5 }}>{STATUS_LABEL[s]}</ToggleButton>)}
            </ToggleButtonGroup>
          )}

          <SectionLabel>Request</SectionLabel>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Name">{r.name}</InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Company">{r.company}</InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Mobile"><Link href={`tel:+91${r.mobile}`} underline="hover">{formatMobile(r.mobile)}</Link></InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Email"><Link href={`mailto:${r.email}`} underline="hover">{r.email}</Link></InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Received">{when(r.created_at)}</InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Came from">{describeSource(r.source, r.entry_point)}</InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="First contacted">{r.contacted_at ? when(r.contacted_at) : "Not yet"}</InfoBox></Grid>
            <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Asked again">{r.repeat_count > 0 ? `${r.repeat_count} time${r.repeat_count === 1 ? "" : "s"}, last ${when(r.last_submitted_at)}` : "No, asked only once"}</InfoBox></Grid>
          </Grid>

          <SectionLabel>Follow-up</SectionLabel>
          <FollowUp request={r} staff={staff} onSaved={onChanged} />
        </DetailTabPanel>

        <DetailTabPanel value={tab} index={1}>
          {r.events.length === 0 ? <EmptyState title="No activity yet" /> : (
            <List disablePadding>
              {r.events.map((e) => (
                <ListItem key={e.id} divider disableGutters>
                  <ListItemText primary={e.summary} secondary={`${e.actor_name ?? "Website visitor"} · ${when(e.created_at)}`} />
                </ListItem>
              ))}
            </List>
          )}
        </DetailTabPanel>
      </DetailViewTabs>
    </DetailViewLayout>
  );
}

export function DemoRequestDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data, error, loading, reload } = useFetch<DemoRequestDetailData>(`/api/demo-requests/${id}`);
  const staff = useFetch<{ items: StaffOption[] }>("/api/users/options");
  const back = () => router.push("/demo-requests");

  // After a change, refetch this page and tell the sidebar badge to recount.
  const changed = () => { reload(); announceDemoRequestsChanged(); };

  if (!data) {
    return <DetailViewLayout isLoading={loading && !error} isError={Boolean(error) || !loading} errorMessage={error ?? "Demo request not found"} onBack={back} backLabel="Back to Demo Requests" sidebar={null}>{null}</DetailViewLayout>;
  }
  return <DemoRequestPage request={data} staff={staff.data?.items ?? []} onBack={back} onChanged={changed} />;
}
