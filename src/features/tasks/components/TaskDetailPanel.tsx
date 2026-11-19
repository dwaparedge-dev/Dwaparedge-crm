"use client";
import { useState } from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Drawer from "@mui/material/Drawer";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";
import { InfoBox, SectionLabel } from "@/components/common/InfoBox";
import { useNotify } from "@/components/common/Notify";
import { EmptyState, ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { useCurrentUser } from "@/components/layout/CurrentUserContext";
import { ApiError, api } from "@/lib/api-client";
import { dueText, followUpsText, formatWhen, shortDate, sourceLink } from "../display";
import { canEditRow } from "../policy";
import type { TaskRow } from "../queries";
import type { TaskEventRow } from "../service";
import { announceTasksChanged } from "../useDeskCounts";
import { CategoryChip, PriorityChip, STATUS_LABEL } from "./common";

type TaskDetail = TaskRow & { events: TaskEventRow[] };

const NOTE_MAX = 2000;
const TITLE_ID = "task-panel-title";

/** Add a note to the timeline. Only shown to someone who may change the task. */
function NoteBox({ taskId, onAdded }: { taskId: string; onAdded: () => void }) {
  const notify = useNotify();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const empty = note.trim() === "";

  async function add() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/tasks/${taskId}/notes`, { method: "POST", body: { note } });
      notify.success("Note added");
      setNote("");
      onAdded();
      announceTasksChanged();
    } catch (e) {
      // The server's message names the problem ("Note is required", "Note can be at most 2000 characters"): show it beside the box.
      setError(e instanceof ApiError && e.details?.issues?.[0] ? e.details.issues[0].message : e instanceof Error ? e.message : "Could not add the note");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "grid", gap: 1.5 }}>
      <TextField
        id="task-note" label="Add a note" multiline minRows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy}
        placeholder="Called, no answer. Will try again Friday." error={Boolean(error)} helperText={error ?? `${note.length} / ${NOTE_MAX}`}
        slotProps={{ htmlInput: { maxLength: NOTE_MAX } }}
      />
      <Box><Button id="task-note-add" variant="contained" size="small" disabled={busy || empty} onClick={add}>{busy ? "Adding…" : "Add note"}</Button></Box>
    </Box>
  );
}

function Details({ task: t, today, onNoteAdded }: { task: TaskDetail; today: string; onNoteAdded: () => void }) {
  const user = useCurrentUser();
  const canEdit = canEditRow(user, t);
  const source = sourceLink(t.source_type, t.source_id);

  return (
    <>
      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mb: 2 }}>
        <Chip size="small" variant="outlined" label={STATUS_LABEL[t.status]} />
        <PriorityChip name={t.priority_name} colour={t.priority_colour} />
        <CategoryChip name={t.category_name} colour={t.category_colour} />
        {t.origin === "auto" && <Chip size="small" variant="outlined" label="auto" />}
      </Box>

      {t.description && <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", mb: 2 }}>{t.description}</Typography>}

      <Grid container spacing={1.5}>
        <Grid size={{ xs: 12, sm: 6 }}><InfoBox label="Owner">{t.owner_name ?? "Unassigned"}</InfoBox></Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InfoBox label="Due">{t.due_date ? `${shortDate(t.due_date)} · ${dueText(t.due_date, today)}` : "No due date"}</InfoBox>
        </Grid>
        <Grid size={{ xs: 12, sm: 6 }}>
          <InfoBox label="Client">
            {t.client_id && t.client_name ? <Link component={NextLink} href={`/clients/${t.client_id}`} underline="hover">{t.client_name}</Link> : null}
          </InfoBox>
        </Grid>
        {source && (
          <Grid size={{ xs: 12, sm: 6 }}>
            <InfoBox label="Raised from">{source.href ? <Link component={NextLink} href={source.href} underline="hover">{source.label}</Link> : source.label}</InfoBox>
          </Grid>
        )}
        {t.follow_up_at && <Grid size={{ xs: 12, sm: 6 }}><InfoBox label="Follow-up">{formatWhen(t.follow_up_at)}</InfoBox></Grid>}
        {t.follow_up_count > 0 && <Grid size={{ xs: 12, sm: 6 }}><InfoBox label="Followed up">{followUpsText(t.follow_up_count)}</InfoBox></Grid>}
        {t.waiting_on && <Grid size={{ xs: 12, sm: 6 }}><InfoBox label="Waiting on">{t.waiting_on}</InfoBox></Grid>}
        <Grid size={{ xs: 12, sm: 6 }}><InfoBox label="Created by">{`${t.created_by_name ?? "System"} · ${formatWhen(t.created_at)}`}</InfoBox></Grid>
        {t.completed_at && (
          <Grid size={{ xs: 12, sm: 6 }}><InfoBox label={t.status === "cancelled" ? "Closed" : "Completed"}>{formatWhen(t.completed_at)}</InfoBox></Grid>
        )}
      </Grid>

      <SectionLabel>Timeline</SectionLabel>
      {canEdit && <Box sx={{ mb: 2 }}><NoteBox taskId={t.id} onAdded={onNoteAdded} /></Box>}
      {t.events.length === 0 ? <EmptyState title="No activity yet" /> : (
        <List disablePadding>
          {t.events.map((e) => (
            <ListItem key={e.id} divider disableGutters>
              <ListItemText primary={e.summary} secondary={`${e.actor_name ?? "System"} · ${formatWhen(e.created_at)}`} slotProps={{ primary: { sx: { overflowWrap: "anywhere" } } }} />
            </ListItem>
          ))}
        </List>
      )}
    </>
  );
}

/** A task's fields and timeline in a side panel, with a box to add a note. Mount it with `key={taskId}` so one task never shows another's data. */
export function TaskDetailPanel({ taskId, today, onClose }: { taskId: string; today: string; onClose: () => void }) {
  const { data, error, reload } = useFetch<TaskDetail>(`/api/tasks/${taskId}`);

  return (
    <Drawer
      anchor="right" open onClose={onClose}
      slotProps={{ paper: { role: "dialog", "aria-modal": true, "aria-labelledby": TITLE_ID, sx: { width: { xs: "100%", sm: 520 }, maxWidth: "100%" } } }}
    >
      <Box sx={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 1, px: 2.5, py: 2, borderBottom: "1px solid", borderColor: "divider" }}>
        <Typography id={TITLE_ID} component="h2" variant="h6" sx={{ fontWeight: 700, fontSize: "1.1rem", overflowWrap: "anywhere" }}>
          {data?.title ?? "Task"}
        </Typography>
        <IconButton onClick={onClose} size="small" aria-label="Close task details"><CloseIcon fontSize="small" /></IconButton>
      </Box>
      <Box sx={{ px: 2.5, py: 2, overflowY: "auto" }}>
        {data ? (
          <Details task={data} today={today} onNoteAdded={reload} />
        ) : error ? (
          <ErrorState message={error} onRetry={reload} />
        ) : (
          <Box aria-busy="true" aria-label="Loading task"><Skeleton width="60%" /><Skeleton variant="rounded" height={120} sx={{ mt: 2 }} /><Skeleton variant="rounded" height={160} sx={{ mt: 2 }} /></Box>
        )}
      </Box>
    </Drawer>
  );
}
