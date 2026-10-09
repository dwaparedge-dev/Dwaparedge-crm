"use client";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";

/** Placeholder popup shown while an add/edit popup loads its record (or fails to). */
export function LoadingDialog({ error, onRetry, onClose }: { error?: string | null; onRetry: () => void; onClose: () => void }) {
  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogContent sx={{ py: 3 }}>
        {error ? <Typography color="error">{error}</Typography> : <><Skeleton width={180} height={32} /><Skeleton variant="rounded" height={260} sx={{ mt: 2 }} /></>}
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        {error && <Button onClick={onRetry}>Try again</Button>}
        <Button onClick={onClose} variant="outlined">Close</Button>
      </DialogActions>
    </Dialog>
  );
}
