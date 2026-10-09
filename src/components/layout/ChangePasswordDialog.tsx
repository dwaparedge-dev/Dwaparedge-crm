"use client";
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import { useNotify } from "@/components/common/Notify";
import { api } from "@/lib/api-client";

export function ChangePasswordDialog({ onClose }: { onClose: () => void }) {
  const notify = useNotify();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mismatch = confirm !== "" && confirm !== next;
  const tooShort = next !== "" && next.length < 12;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api("/api/auth/change-password", { method: "POST", body: { currentPassword: current, newPassword: next } });
      notify.success("Password changed. You were signed out of your other sessions.");
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not change the password");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="xs" fullWidth>
      <DialogTitle>Change password</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
        {error && <Alert severity="error">{error}</Alert>}
        <TextField label="Current password" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} autoFocus />
        <TextField label="New password" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={tooShort} helperText={tooShort ? "At least 12 characters" : "At least 12 characters. A passphrase works well."} />
        <TextField label="Confirm new password" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={mismatch} helperText={mismatch ? "Passwords do not match" : undefined} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy || !current || next.length < 12 || next !== confirm}>{busy ? "Saving…" : "Change password"}</Button>
      </DialogActions>
    </Dialog>
  );
}
