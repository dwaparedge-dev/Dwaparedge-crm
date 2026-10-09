"use client";
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import FormControl from "@mui/material/FormControl";
import FormControlLabel from "@mui/material/FormControlLabel";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Radio from "@mui/material/Radio";
import RadioGroup from "@mui/material/RadioGroup";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { planShares, type BillMode } from "@/lib/billing";
import { formatMoney } from "@/lib/format";
import { computeLine, formatScaled, parseScaled } from "@/lib/money";
import { api } from "@/lib/api-client";
import type { MilestoneRow, SaleItemRow } from "../service";

type Mode = "rest" | "percent" | "amount" | "milestone";
interface Props {
  saleId: string;
  subtotal: string;
  items: SaleItemRow[];
  milestones: MilestoneRow[];
  initialMilestoneId?: string;
  submitLabel?: string;
  onCreated: (invoiceId: string) => void;
  onCancel?: () => void;
}

/** Chooses how much of the sale this invoice bills, previews it, and creates the draft. */
export function BillSaleForm({ saleId, subtotal, items, milestones, initialMilestoneId, submitLabel = "Create draft invoice", onCreated, onCancel }: Props) {
  const planned = milestones.filter((m) => !m.invoice_id);
  const [mode, setMode] = useState<Mode>(initialMilestoneId ? "milestone" : "rest");
  const [percent, setPercent] = useState("");
  const [amount, setAmount] = useState("");
  const [milestoneId, setMilestoneId] = useState(initialMilestoneId ?? planned[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const billable = items.map((i) => ({ id: i.id, taxable: i.taxable_amount, remaining: i.remaining_taxable }));
  const leftTaxable = billable.reduce((a, b) => a + parseScaled(b.remaining, 2), 0n);

  // Mirrors the server's choice of mode for a milestone (the last open instalment takes the exact remainder).
  const effective: BillMode | null = useMemo(() => {
    if (mode === "rest") return { kind: "rest" };
    if (mode === "percent") return percent ? { kind: "percent", percent } : null;
    if (mode === "amount") return amount ? { kind: "amount", amount } : null;
    const m = milestones.find((x) => x.id === milestoneId);
    if (!m) return null;
    const plannedTotal = milestones.reduce((a, x) => a + parseScaled(x.taxable, 2), 0n);
    if (planned.length === 1 && plannedTotal === parseScaled(subtotal, 2)) return { kind: "rest" };
    return m.basis === "percent" ? { kind: "percent", percent: m.percent! } : { kind: "amount", amount: m.amount! };
  }, [mode, percent, amount, milestoneId, milestones, planned.length, subtotal]);

  const preview = useMemo(() => {
    if (!effective) return null;
    try {
      const shares = planShares(billable, effective);
      let taxable = 0n;
      let total = 0n;
      for (const sh of shares) {
        const item = items.find((i) => i.id === sh.itemId)!;
        const l = computeLine({ unitPrice: sh.taxable, quantity: 1, taxRate: item.tax_rate });
        taxable += parseScaled(l.taxable, 2);
        total += parseScaled(l.total, 2);
      }
      return { taxable: formatScaled(taxable, 2), total: formatScaled(total, 2), error: null as string | null };
    } catch (e) {
      return { taxable: "0.00", total: "0.00", error: (e as Error).message };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effective, items]);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const body = mode === "rest" ? { mode } : mode === "percent" ? { mode, percent } : mode === "amount" ? { mode, amount } : { mode, milestoneId };
      const r = await api<{ id: string }>(`/api/sales/${saleId}/invoice`, { method: "POST", body });
      onCreated(r.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not create the invoice");
      setBusy(false);
    }
  }

  const canSubmit = !busy && preview !== null && !preview.error && (mode !== "milestone" || Boolean(milestoneId));
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      {leftTaxable <= 0n ? (
        <Alert severity="info">Everything on this sale is already on an invoice (or a draft). Delete a draft or cancel an invoice to bill it again.</Alert>
      ) : (
        <FormControl>
          <RadioGroup value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <FormControlLabel value="rest" control={<Radio />} label={`Everything that's left (${formatMoney(formatScaled(leftTaxable, 2))} before GST)`} />
            <FormControlLabel value="percent" control={<Radio />} label="A percentage of the order" />
            {mode === "percent" && (
              <TextField size="small" label="Percentage" value={percent} onChange={(e) => setPercent(e.target.value)} autoFocus sx={{ ml: 4, mb: 1, maxWidth: 200 }} inputMode="decimal"
                slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} helperText="Of each item's value, capped at what's left" />
            )}
            <FormControlLabel value="amount" control={<Radio />} label="A fixed amount (before GST)" />
            {mode === "amount" && (
              <TextField size="small" label="Amount before GST" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus sx={{ ml: 4, mb: 1, maxWidth: 240 }} inputMode="decimal"
                slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} helperText="GST is added on top. Split across items in proportion to what's left" />
            )}
            <FormControlLabel value="milestone" disabled={planned.length === 0} control={<Radio />} label={planned.length ? "An instalment from the billing plan" : "An instalment from the billing plan (none planned)"} />
            {mode === "milestone" && (
              <TextField select size="small" label="Instalment" value={milestoneId} onChange={(e) => setMilestoneId(e.target.value)} sx={{ ml: 4, mb: 1, maxWidth: 320 }}>
                {planned.map((m) => <MenuItem key={m.id} value={m.id}>{m.title} · {m.basis === "percent" ? `${Number(m.percent)}%` : formatMoney(m.amount!)}{m.due_date ? ` · due ${m.due_date}` : ""}</MenuItem>)}
              </TextField>
            )}
          </RadioGroup>
        </FormControl>
      )}
      {preview && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>
          {preview.error ? <Typography color="error" variant="body2">{preview.error}</Typography> : (
            <>
              <Typography variant="body2">This invoice: <strong>{formatMoney(preview.taxable)}</strong> before GST · about <strong>{formatMoney(preview.total)}</strong> with GST</Typography>
              <Typography variant="caption" color="text.secondary">The draft is created for you to review. CGST/SGST or IGST and the final total are set from the client’s state.</Typography>
            </>
          )}
        </Box>
      )}
      <Box sx={{ display: "flex", justifyContent: "flex-end", gap: 1 }}>
        {onCancel && <Button onClick={onCancel} disabled={busy}>Cancel</Button>}
        <Button variant="contained" onClick={submit} disabled={!canSubmit}>{busy ? "Creating…" : submitLabel}</Button>
      </Box>
    </Box>
  );
}
