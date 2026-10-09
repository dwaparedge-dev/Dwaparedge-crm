"use client";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import Typography from "@mui/material/Typography";
import CloseIcon from "@mui/icons-material/Close";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Called on submit (already wrapped with react-hook-form's handleSubmit by the caller). */
  onSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  submitting?: boolean;
  /** Disables the primary button without showing the saving label. */
  submitDisabled?: boolean;
  submitLabel: string;
  submittingLabel?: string;
  error?: string | null;
  maxWidth?: "sm" | "md" | "lg" | "xl";
  /** Extra content kept outside the scrolling body (e.g. a confirm dialog). */
  children: React.ReactNode;
}

/**
 * Add / edit popup in FactoONE's modal style: titled header with a close button, a scrolling body
 * and a footer with Cancel + the primary action. Sections inside are flat bordered boxes.
 */
export function FormShell({ open, title, onClose, onSubmit, submitting, submitDisabled, submitLabel, submittingLabel = "Saving…", error, maxWidth = "md", children }: Props) {
  return (
    <Dialog open={open} onClose={submitting ? undefined : onClose} maxWidth={maxWidth} fullWidth scroll="paper" slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <Box component="form" noValidate onSubmit={onSubmit} sx={{ display: "flex", flexDirection: "column", minHeight: 0, flex: 1 }}>
        <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pt: 2.5, pb: 2, borderBottom: "1px solid var(--mui-palette-divider)" }}>
          <Typography component="span" variant="h6" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>{title}</Typography>
          <IconButton onClick={onClose} size="small" disabled={submitting} aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
        </DialogTitle>
        <DialogContent
          sx={{
            pt: 2.5, "&&": { pt: 2.5 },
            "& .MuiCard-root": { boxShadow: "none", border: "1px solid var(--mui-palette-divider)", borderRadius: 2, mb: 2 },
          }}
        >
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          {children}
        </DialogContent>
        <DialogActions sx={{ px: 3, py: 2, gap: 1.5, borderTop: "1px solid var(--mui-palette-divider)" }}>
          <Button onClick={onClose} variant="outlined" disabled={submitting} sx={{ borderRadius: 2 }}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={submitting || submitDisabled} sx={{ borderRadius: 2, minWidth: 130 }}>{submitting ? submittingLabel : submitLabel}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}
