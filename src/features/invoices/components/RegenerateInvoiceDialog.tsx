"use client";
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Checkbox from "@mui/material/Checkbox";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import FormLabel from "@mui/material/FormLabel";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import { format, parseISO } from "date-fns";
import { api } from "@/lib/api-client";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: string;
  /** The invoice's current due date; null = not specified. */
  dueDate: string | null;
  onClose: () => void;
  onDone: (version: number) => void;
}

/** Regenerate an issued invoice. The note is optional and is shown in the version history. */
export function RegenerateInvoiceDialog({ invoiceId, invoiceNumber, issueDate, dueDate, onClose, onDone }: Props) {
  const [reason, setReason] = useState("");
  const [today] = useState(() => format(new Date(), "yyyy-MM-dd"));
  const [updateDate, setUpdateDate] = useState(true);
  const [due, setDue] = useState<"keep" | "none" | "date">("keep");
  const [newDate, setNewDate] = useState(dueDate ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const invoiceDate = updateDate ? today : issueDate;
    const finalDue = due === "keep" ? dueDate : due === "none" ? null : newDate;
    if (due === "date" && !newDate) {
      setError("Choose the new due date");
      return;
    }
    if (finalDue && finalDue < invoiceDate) {
      setError(`The due date (${format(parseISO(finalDue), "dd MMM yyyy")}) would be before the invoice date (${format(parseISO(invoiceDate), "dd MMM yyyy")}). Choose a later due date or "Not specified".`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { version } = await api<{ version: number }>(`/api/invoices/${invoiceId}/regenerate`, { method: "POST", body: { reason, updateInvoiceDate: updateDate, ...(due === "none" ? { dueDate: null } : due === "date" ? { dueDate: newDate } : {}) } });
      onDone(version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not regenerate the invoice");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Regenerate invoice</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <DialogContentText component="div">
          A new version of <strong>{invoiceNumber}</strong> is made with the client, company and project details as they are today and the current layout.
          The invoice number, lines and amounts stay exactly the same, and every earlier version is kept with its date and time.
        </DialogContentText>
        {error && <Alert severity="error">{error}</Alert>}
        <FormControlLabel
          control={<Checkbox checked={updateDate} onChange={(e) => setUpdateDate(e.target.checked)} />}
          label={<>Update the invoice date to today <Box component="span" sx={{ color: "text.secondary" }}>({format(parseISO(today), "dd MMM yyyy")}; now {format(parseISO(issueDate), "dd MMM yyyy")})</Box></>}
        />
        <FormControl>
          <FormLabel>Payment due date</FormLabel>
          <RadioGroup value={due} onChange={(e) => setDue(e.target.value as typeof due)}>
            <FormControlLabel value="keep" control={<Radio size="small" />} label={`Keep as it is (${dueDate ? format(parseISO(dueDate), "dd MMM yyyy") : "not specified"})`} />
            <FormControlLabel value="none" control={<Radio size="small" />} label="Not specified" />
            <FormControlLabel value="date" control={<Radio size="small" />} label="Set a different date" />
          </RadioGroup>
          {due === "date" && (
            <TextField type="date" size="small" label="New due date" value={newDate} onChange={(e) => setNewDate(e.target.value)} sx={{ mt: 1, maxWidth: 220 }}
              slotProps={{ inputLabel: { shrink: true }, htmlInput: { min: updateDate ? today : issueDate } }} />
          )}
        </FormControl>
        <TextField label="Note (optional)" placeholder="e.g. Client address corrected" multiline minRows={2} autoFocus value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Back</Button>
        <Button variant="contained" onClick={submit} disabled={busy}>{busy ? "Generating…" : "Regenerate"}</Button>
      </DialogActions>
    </Dialog>
  );
}
