"use client";
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { ApiError, api } from "@/lib/api-client";

export type QuickKind = "category" | "priority";

interface Props {
  kind: QuickKind;
  /** A priority's default rank: one place after the least urgent one now. */
  nextRank: number;
  onClose: () => void;
  onCreated: (created: { id: string; name: string }) => void;
}

const COLOUR = "#64748b";

/**
 * Adds a category or a priority without leaving the task form. It is a plain dialog, not a form: it opens from inside the
 * task form's dialog, and a nested submit would reach the task form. The same endpoints as Settings do the work.
 */
export function QuickAddConfigDialog({ kind, nextRank, onClose, onCreated }: Props) {
  const isCategory = kind === "category";
  const [name, setName] = useState("");
  const [colour, setColour] = useState(COLOUR);
  const [rank, setRank] = useState(String(nextRank));
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const label = name.trim();
    if (!label || busy) return;
    const whole = (v: string, min: number, max: number) => (/^\d{1,3}$/.test(v.trim()) && +v >= min && +v <= max ? +v : undefined);
    let body: Record<string, unknown> = { name: label, colour };
    if (isCategory) {
      if (days.trim() !== "") {
        const n = whole(days, 1, 365);
        if (n === undefined) return setError("Follow-up days must be a whole number from 1 to 365, or blank");
        body = { ...body, defaultFollowUpDays: n };
      }
    } else {
      const n = whole(rank, 1, 99);
      if (n === undefined) return setError("Rank must be a whole number from 1 to 99");
      body = { ...body, rank: n };
    }
    setBusy(true);
    setError(null);
    try {
      const { id } = await api<{ id: string }>(isCategory ? "/api/task-categories" : "/api/task-priorities", { method: "POST", body });
      onCreated({ id, name: label });
    } catch (e) {
      setError(e instanceof ApiError || e instanceof Error ? e.message : "Could not add it");
      setBusy(false);
    }
  }

  const onEnter = (e: React.KeyboardEvent) => { if (e.key === "Enter") { e.preventDefault(); void add(); } };

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ fontWeight: 700 }}>{isCategory ? "Add a category" : "Add a priority"}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box sx={{ display: "flex", gap: 1, alignItems: "flex-start", mt: 0.5 }}>
          <Box
            component="input" type="color" value={colour} aria-label="Colour" onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColour(e.target.value)}
            sx={{ width: 38, height: 40, p: 0, border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "transparent", cursor: "pointer", flexShrink: 0 }}
          />
          <TextField
            autoFocus fullWidth label="Name" value={name} disabled={busy} onChange={(e) => setName(e.target.value)} onKeyDown={onEnter}
            slotProps={{ htmlInput: { maxLength: 60 } }}
          />
        </Box>
        {isCategory ? (
          <TextField
            fullWidth label="Follow-up days" value={days} disabled={busy} onChange={(e) => setDays(e.target.value)} onKeyDown={onEnter} sx={{ mt: 2 }}
            helperText="How long a task waits after you chase it. Leave blank for no repeat." slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 3 } }}
          />
        ) : (
          <TextField
            fullWidth label="Rank" value={rank} disabled={busy} onChange={(e) => setRank(e.target.value)} onKeyDown={onEnter} sx={{ mt: 2 }}
            helperText="1 is the most urgent. It orders tasks inside a Desk section." slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 2 } }}
          />
        )}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button type="button" onClick={onClose} disabled={busy}>Cancel</Button>
        <Button type="button" variant="contained" onClick={() => void add()} disabled={busy || !name.trim()}>{busy ? "Adding…" : "Add"}</Button>
      </DialogActions>
    </Dialog>
  );
}
