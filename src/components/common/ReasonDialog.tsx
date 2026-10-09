"use client";
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";

interface Props {
  title: string;
  message: React.ReactNode;
  confirmLabel: string;
  onClose: () => void;
  /** Resolve on success; throw (with a user-readable message) to keep the dialog open. */
  onSubmit: (reason: string) => Promise<void>;
}

/** Confirmation that requires a written reason: cancellations, voids, reversals. */
export function ReasonDialog({ title, message, confirmLabel, onClose, onSubmit }: Props) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await onSubmit(reason.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action failed");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title}</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <DialogContentText component="div">{message}</DialogContentText>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Reason (required)" required multiline minRows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Back</Button>
        <Button color="error" variant="contained" onClick={submit} disabled={busy || reason.trim().length < 3}>{busy ? "Working…" : confirmLabel}</Button>
      </DialogActions>
    </Dialog>
  );
}
