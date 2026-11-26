"use client";
import { useEffect, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";

interface Props {
  invoiceId: string;
  invoiceNumber: string;
  /** The invoice's current total incl. GST, e.g. "3540.00". */
  currentTotal: string;
  onClose: () => void;
  onDone: (version: number) => void;
}

/** What revising to the typed total would do, from the server (nothing is changed by asking). */
interface Preview {
  currentTotal: string;
  newSubtotal: string;
  newTax: string;
  newRoundOff: string;
  newTotal: string;
  allocated: string;
  /** Why it cannot be done, if so. */
  blocked: string | null;
  /** Invoices of the sale issued after this one. */
  laterInvoices: { id: string; invoice_number: string }[];
}

const MONEY = /^\d+(\.\d{1,2})?$/;

/** Change the total (incl. GST) of an issued invoice. The number, date and client stay; the earlier version is kept. */
export function ReviseInvoiceDialog({ invoiceId, invoiceNumber, currentTotal, onClose, onDone }: Props) {
  const [total, setTotal] = useState(Number(currentTotal).toFixed(2));
  const [asked, setAsked] = useState(total);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ask the server only once typing pauses.
  useEffect(() => {
    const t = setTimeout(() => setAsked(total.trim()), 400);
    return () => clearTimeout(t);
  }, [total]);

  const valid = MONEY.test(total.trim()) && Number(total) > 0;
  const preview = useFetch<Preview>(valid && MONEY.test(asked) ? `/api/invoices/${invoiceId}/revise?total=${asked}` : null);
  const p = preview.data;
  const settled = valid && asked === total.trim() && !preview.loading && p !== null;
  const unchanged = valid && Number(total) === Number(currentTotal);
  const canSubmit = settled && !p!.blocked && !unchanged && reason.trim().length > 0 && !busy;

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const { version } = await api<{ version: number }>(`/api/invoices/${invoiceId}/revise`, { method: "POST", body: { total: total.trim(), reason: reason.trim() } });
      onDone(version);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not revise the invoice");
      setBusy(false);
    }
  }

  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Revise invoice amount</DialogTitle>
      <DialogContent sx={{ display: "grid", gap: 2 }}>
        <DialogContentText component="div">
          Change what <strong>{invoiceNumber}</strong> totals, including GST (now {formatMoney(currentTotal)}). The invoice keeps its number and date,
          the earlier version is kept under Versions, and the instalment it bills follows the new amount.
        </DialogContentText>
        <Alert severity="warning">
          The number stays <strong>{invoiceNumber}</strong>. If this invoice was already filed for GST or sent with an e-invoice number, check with your accountant first.
        </Alert>
        {error && <Alert severity="error">{error}</Alert>}
        {preview.error && !error && <Alert severity="error">{preview.error}</Alert>}
        <TextField
          label="New invoice total, including GST" value={total} onChange={(e) => setTotal(e.target.value)} autoFocus inputMode="decimal"
          error={total.trim() !== "" && !valid} helperText={total.trim() !== "" && !valid ? "Enter an amount greater than 0 with at most two decimals" : undefined}
          slotProps={{ htmlInput: { "aria-label": "New invoice total including GST" } }}
        />
        {settled && p && !p.blocked && !unchanged && (
          <Box sx={{ p: 1.5, border: 1, borderColor: "divider", borderRadius: 2, display: "grid", gap: 0.5 }}>
            <Row label="Amount before GST" value={formatMoney(p.newSubtotal)} />
            <Row label="GST" value={formatMoney(p.newTax)} />
            {Number(p.newRoundOff) !== 0 && <Row label="Round off" value={formatMoney(p.newRoundOff)} />}
            <Row label="Invoice total" value={formatMoney(p.newTotal)} bold />
            {Number(p.allocated) > 0 && <Typography variant="caption" color="text.secondary">{formatMoney(p.allocated)} is already paid on this invoice.</Typography>}
          </Box>
        )}
        {settled && p?.blocked && <Alert severity="error">{p.blocked}</Alert>}
        {p && p.laterInvoices.length > 0 && !p.blocked && (
          <Alert severity="info">
            {p.laterInvoices.map((x) => x.invoice_number).join(", ")} {p.laterInvoices.length === 1 ? "was" : "were"} issued after this invoice and still {p.laterInvoices.length === 1 ? "shows" : "show"} the
            old amount in its &ldquo;billed so far&rdquo; figures. Regenerate {p.laterInvoices.length === 1 ? "it" : "them"} afterwards to update that (not possible while payments are applied).
          </Alert>
        )}
        <TextField label="Reason" placeholder="e.g. Client agreed to pay 50,000 all-in" multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)} slotProps={{ htmlInput: { maxLength: 500 } }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Back</Button>
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>{busy ? "Revising…" : "Revise invoice"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <Box sx={{ display: "flex", justifyContent: "space-between" }}>
      <Typography variant="body2" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ fontWeight: bold ? 700 : 400 }}>{value}</Typography>
    </Box>
  );
}
