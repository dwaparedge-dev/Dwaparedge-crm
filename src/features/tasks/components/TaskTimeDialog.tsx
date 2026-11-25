"use client";
import { useState } from "react";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api } from "@/lib/api-client";
import { useNotify } from "@/components/common/Notify";
import { FOLLOW_UP_PRESETS, SNOOZE_PRESETS, daysFromNow, localToIso, whenProblem } from "../follow-up-times";
import type { TaskRow } from "../queries";

export type TimeMode = "followup" | "snooze" | "waiting";

const TITLE: Record<TimeMode, string> = { followup: "Follow up", snooze: "Snooze", waiting: "Mark as waiting" };

/** One dialog for the three actions that choose a time: record a follow-up, snooze, or mark a task as waiting on someone. */
export function TaskTimeDialog({ task, mode, onClose, onDone }: { task: TaskRow; mode: TimeMode; onClose: () => void; onDone: (message: string) => void }) {
  const notify = useNotify();
  const presets = mode === "snooze" ? SNOOZE_PRESETS : FOLLOW_UP_PRESETS;
  const [note, setNote] = useState("");
  const [waitingOn, setWaitingOn] = useState("");
  const [choice, setChoice] = useState<string>(presets[0]!.key);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const cadence = task.follow_up_every_days;

  async function submit() {
    setError(null);
    const now = new Date();
    let iso: string | null = null;
    const needsTime = choice !== "stop" && choice !== "cadence";
    if (needsTime) {
      const preset = presets.find((p) => p.key === choice);
      iso = preset ? daysFromNow(preset.days, now) : localToIso(custom);
      const problem = whenProblem(iso, now);
      if (problem) return setError(problem);
    }
    if (mode === "followup" && note.trim() === "") return setError("Write what happened");
    if (mode === "waiting" && waitingOn.trim() === "") return setError("Say who or what you are waiting on");

    setBusy(true);
    try {
      if (mode === "followup") {
        const next = choice === "stop" ? { kind: "stop" } : choice === "cadence" ? { kind: "cadence" } : { kind: "at", at: iso };
        await api(`/api/tasks/${task.id}/follow-up`, { method: "POST", body: { note: note.trim(), next } });
        onDone("Follow-up recorded");
      } else if (mode === "snooze") {
        await api(`/api/tasks/${task.id}/snooze`, { method: "POST", body: { until: iso } });
        onDone("Snoozed");
      } else {
        await api(`/api/tasks/${task.id}/status`, { method: "POST", body: { status: "waiting", waitingOn: waitingOn.trim(), followUpAt: iso } });
        onDone("Marked as waiting");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : "Something went wrong. Please try again.";
      setError(message);
      notify.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth aria-labelledby="task-time-title">
      <DialogTitle id="task-time-title">{TITLE[mode]}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" sx={{ mb: 2, overflowWrap: "anywhere" }}>{task.title}</Typography>
        {mode === "followup" && (
          <TextField label="What happened" value={note} onChange={(e) => setNote(e.target.value)} multiline minRows={2} fullWidth required slotProps={{ htmlInput: { maxLength: 2000 } }} sx={{ mb: 2 }} />
        )}
        {mode === "waiting" && (
          <TextField label="Waiting on" value={waitingOn} onChange={(e) => setWaitingOn(e.target.value)} fullWidth required slotProps={{ htmlInput: { maxLength: 200 } }} sx={{ mb: 2 }} />
        )}
        <Typography id="task-time-choice" variant="subtitle2">{mode === "followup" ? "Next follow-up" : mode === "snooze" ? "Bring it back" : "Back on"}</Typography>
        <RadioGroup aria-labelledby="task-time-choice" value={choice} onChange={(e) => setChoice(e.target.value)}>
          {presets.map((p) => <FormControlLabel key={p.key} value={p.key} control={<Radio />} label={p.label} />)}
          <FormControlLabel value="custom" control={<Radio />} label="Pick a date and time" />
          {choice === "custom" && (
            <TextField type="datetime-local" size="small" value={custom} onChange={(e) => setCustom(e.target.value)} slotProps={{ htmlInput: { "aria-label": "Date and time" } }} sx={{ ml: 4, mb: 1 }} />
          )}
          {mode === "followup" && cadence !== null && <FormControlLabel value="cadence" control={<Radio />} label={`Same cadence (every ${cadence} days)`} />}
          {mode === "followup" && <FormControlLabel value="stop" control={<Radio />} label="No more follow-ups" />}
        </RadioGroup>
        {error && <Typography role="alert" color="error" variant="body2" sx={{ mt: 1 }}>{error}</Typography>}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={() => void submit()} disabled={busy}>{TITLE[mode]}</Button>
      </DialogActions>
    </Dialog>
  );
}
