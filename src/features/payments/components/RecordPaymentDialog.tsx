"use client";
import { useState } from "react";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import Grid from "@mui/material/Grid";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ClientPicker } from "@/components/common/ClientPicker";
import { useNotify } from "@/components/common/Notify";
import { ApiError, api } from "@/lib/api-client";
import { todayIST } from "@/lib/dates";
import { formatScaled, parseScaled } from "@/lib/money";
import { OptionSelect } from "@/features/options/components/OptionSelect";
import { AllocationGrid, sumAllocations } from "./AllocationGrid";

interface Props {
  clientId?: string;
  /** Pre-select an invoice: its balance becomes the suggested amount and allocation. */
  focusInvoiceId?: string;
  /** Record the payment for this sale: it is tagged to it, and what is not allocated becomes the sale's advance. */
  saleId?: string;
  saleNumber?: string;
  suggestedAmount?: string;
  onClose: () => void;
  onSaved: (paymentId: string) => void;
}

const AMOUNT = /^\d+(\.\d{1,2})?$/;

export function RecordPaymentDialog({ clientId: initialClient = "", focusInvoiceId, saleId, saleNumber, suggestedAmount, onClose, onSaved }: Props) {
  const notify = useNotify();
  const [clientId, setClientId] = useState(initialClient);
  const [amount, setAmount] = useState(suggestedAmount && Number(suggestedAmount) > 0 ? suggestedAmount : "");
  const [date, setDate] = useState(todayIST());
  const [method, setMethod] = useState("bank_transfer");
  const [reference, setReference] = useState("");
  const [notes, setNotes] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validAmount = AMOUNT.test(amount) && Number(amount) > 0;
  const over = validAmount && sumAllocations(alloc) > parseScaled(amount, 2);
  const canSave = Boolean(clientId) && validAmount && !over && Boolean(date) && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const allocations = Object.entries(alloc)
        .filter(([, v]) => v.trim() && Number(v) > 0)
        .map(([invoiceId, v]) => ({ invoiceId, amount: v.trim() }));
      const r = await api<{ id: string; receiptNumber: string }>("/api/payments", { method: "POST", body: { clientId, saleId: saleId ?? "", paymentDate: date, amount, method, reference, notes, allocations } });
      const left = formatScaled(parseScaled(amount, 2) - sumAllocations(alloc), 2);
      notify.success(`Payment ${r.receiptNumber} recorded${Number(left) > 0 ? `; ${left} kept as ${saleId ? "this sale's " : ""}advance` : ""}`);
      onSaved(r.id);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Could not record the payment");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Record payment</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ pt: 1 }}>
          {error && <Grid size={12}><Alert severity="error">{error}</Alert></Grid>}
          {saleId && <Grid size={12}><Alert severity="info">Recorded for sale <strong>{saleNumber}</strong>. Part payments are fine: allocate what you can to the sale&apos;s invoices below; anything left stays as this sale&apos;s advance and can be applied when the next invoice is issued.</Alert></Grid>}
          <Grid size={{ xs: 12, md: 6 }}>
            <ClientPicker value={clientId} disabled={Boolean(initialClient)} onChange={(id) => { setClientId(id); setAlloc({}); }} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Amount received (₹)" required fullWidth inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)}
              error={amount !== "" && !validAmount} helperText={amount !== "" && !validAmount ? "Up to 2 decimals" : undefined} />
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Payment date" type="date" required fullWidth value={date} onChange={(e) => setDate(e.target.value)} slotProps={{ inputLabel: { shrink: true }, htmlInput: { max: todayIST() } }} />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <OptionSelect table="payments" column="method" label="Method" required value={method} onChange={setMethod} />
          </Grid>
          <Grid size={{ xs: 12, md: 8 }}>
            <TextField label="Transaction / reference number" fullWidth value={reference} onChange={(e) => setReference(e.target.value)} />
          </Grid>
          <Grid size={12}><TextField label="Notes" fullWidth value={notes} onChange={(e) => setNotes(e.target.value)} /></Grid>
          {clientId && (
            <Grid size={12}>
              <Typography variant="subtitle2" sx={{ mb: 1 }}>Apply to invoices (optional)</Typography>
              {validAmount ? (
                <AllocationGrid clientId={clientId} available={amount} values={alloc} onChange={setAlloc} focusInvoiceId={focusInvoiceId} saleId={saleId} />
              ) : (
                <Typography variant="body2" color="text.secondary">Enter the amount to allocate it across open invoices. Anything not allocated stays on account as an advance.</Typography>
              )}
              {over && <Alert severity="error" sx={{ mt: 1 }}>The allocations are more than the amount received.</Alert>}
            </Grid>
          )}
        </Grid>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={!canSave}>{busy ? "Recording…" : "Record payment"}</Button>
      </DialogActions>
    </Dialog>
  );
}
