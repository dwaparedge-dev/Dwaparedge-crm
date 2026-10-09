"use client";
import { useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Divider from "@mui/material/Divider";
import InputAdornment from "@mui/material/InputAdornment";
import ButtonBase from "@mui/material/ButtonBase";
import Radio from "@mui/material/Radio";
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

  const billedTaxable = items.reduce((a, i) => a + parseScaled(i.issued_taxable, 2) + parseScaled(i.draft_taxable, 2), 0n);
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
  const gst = preview && !preview.error ? formatScaled(parseScaled(preview.total, 2) - parseScaled(preview.taxable, 2), 2) : null;
  const after = preview && !preview.error ? leftTaxable - parseScaled(preview.taxable, 2) : null;

  const options: { value: Mode; title: string; hint: string; disabled?: boolean; body?: React.ReactNode }[] = [
    { value: "rest", title: "Everything that's left", hint: `${formatMoney(formatScaled(leftTaxable, 2))} before GST, closes the billing of this sale` },
    {
      value: "percent", title: "A percentage of the order", hint: "Taken from each item's value, capped at what's left",
      body: (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1.5 }}>
          <TextField size="small" label="Percentage" value={percent} onChange={(e) => setPercent(e.target.value)} autoFocus inputMode="decimal" sx={{ width: 150 }}
            slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }} />
          {["25", "30", "50", "100"].map((p) => <Chip key={p} size="small" label={`${p}%`} variant={percent === p ? "filled" : "outlined"} color={percent === p ? "primary" : "default"} onClick={() => setPercent(p)} />)}
        </Box>
      ),
    },
    {
      value: "amount", title: "A fixed amount", hint: "Before GST; GST is added on top and split across items in proportion",
      body: (
        <Box sx={{ display: "flex", gap: 1, alignItems: "center", flexWrap: "wrap", mt: 1.5 }}>
          <TextField size="small" label="Amount before GST" value={amount} onChange={(e) => setAmount(e.target.value)} autoFocus inputMode="decimal" sx={{ width: 200 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }} />
          <Chip size="small" label="Use all that's left" variant="outlined" onClick={() => setAmount(formatScaled(leftTaxable, 2))} />
        </Box>
      ),
    },
    {
      value: "milestone", title: "An instalment from the billing plan", disabled: planned.length === 0,
      hint: planned.length ? `${planned.length} planned instalment${planned.length > 1 ? "s" : ""} not yet invoiced` : "No instalment planned; add one in the Billing plan tab",
      body: (
        <Box sx={{ display: "grid", gap: 0.75, mt: 1.5 }}>
          {planned.map((m) => (
            <ButtonBase key={m.id} onClick={() => setMilestoneId(m.id)} sx={{ display: "flex", justifyContent: "space-between", textAlign: "left", p: 1, borderRadius: 1.5, border: 1, borderColor: milestoneId === m.id ? "primary.main" : "divider", bgcolor: milestoneId === m.id ? "action.selected" : "transparent" }}>
              <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{m.title}</Typography>
                <Typography variant="caption" color="text.secondary">{m.basis === "percent" ? `${Number(m.percent)}% of the order` : "Fixed amount"}{m.due_date ? ` · due ${m.due_date}` : ""}</Typography>
              </Box>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{formatMoney(m.taxable)}</Typography>
            </ButtonBase>
          ))}
        </Box>
      ),
    },
  ];

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", border: 1, borderColor: "divider", borderRadius: 2, overflow: "hidden" }}>
        {[
          ["Order value", formatMoney(subtotal), "before GST"],
          ["Already billed", formatMoney(formatScaled(billedTaxable, 2)), "issued + drafts"],
          ["Left to bill", formatMoney(formatScaled(leftTaxable, 2)), "before GST"],
        ].map(([label, value, hint], i) => (
          <Box key={label} sx={{ p: 1.5, borderLeft: i ? 1 : 0, borderColor: "divider" }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: "uppercase", letterSpacing: "0.04em", fontWeight: 600 }}>{label}</Typography>
            <Typography variant="subtitle1" sx={{ fontWeight: 700, lineHeight: 1.3 }}>{value}</Typography>
            <Typography variant="caption" color="text.secondary">{hint}</Typography>
          </Box>
        ))}
      </Box>
      {leftTaxable <= 0n ? (
        <Alert severity="info">Everything on this sale is already on an invoice (or a draft). Delete a draft or cancel an invoice to bill it again.</Alert>
      ) : (
        <Box role="radiogroup" aria-label="What to bill" sx={{ display: "grid", gap: 1 }}>
          {options.map((o) => {
            const selected = mode === o.value;
            return (
              <Box key={o.value} sx={{ border: 1, borderColor: selected ? "primary.main" : "divider", borderRadius: 2, bgcolor: selected ? "action.hover" : "transparent", opacity: o.disabled ? 0.55 : 1 }}>
                <ButtonBase disabled={o.disabled} onClick={() => setMode(o.value)} role="radio" aria-checked={selected} sx={{ display: "flex", width: "100%", justifyContent: "flex-start", alignItems: "flex-start", textAlign: "left", p: 1.25, borderRadius: 2 }}>
                  <Radio checked={selected} disabled={o.disabled} tabIndex={-1} sx={{ p: 0.5, mr: 1 }} />
                  <Box>
                    <Typography variant="body1" sx={{ fontWeight: 600 }}>{o.title}</Typography>
                    <Typography variant="caption" color="text.secondary">{o.hint}</Typography>
                  </Box>
                </ButtonBase>
                {selected && o.body && <Box sx={{ px: 1.25, pb: 1.25, pl: 5.5 }}>{o.body}</Box>}
              </Box>
            );
          })}
        </Box>
      )}
      {leftTaxable > 0n && (
        <Box sx={{ p: 1.5, bgcolor: "action.hover", borderRadius: 2 }}>
          {!preview ? (
            <Typography variant="body2" color="text.secondary">Enter {mode === "percent" ? "a percentage" : mode === "amount" ? "an amount" : "your choice"} to see what this invoice will be.</Typography>
          ) : preview.error ? <Typography color="error" variant="body2">{preview.error}</Typography> : (
            <>
              <Box sx={{ display: "grid", gridTemplateColumns: "1fr auto", rowGap: 0.5, columnGap: 2 }}>
                <Typography variant="body2" color="text.secondary">Taxable value</Typography><Typography variant="body2" align="right">{formatMoney(preview.taxable)}</Typography>
                <Typography variant="body2" color="text.secondary">GST (approx.)</Typography><Typography variant="body2" align="right">{formatMoney(gst!)}</Typography>
              </Box>
              <Divider sx={{ my: 1 }} />
              <Box sx={{ display: "flex", justifyContent: "space-between" }}>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>Invoice total</Typography>
                <Typography variant="body1" sx={{ fontWeight: 700 }}>{formatMoney(preview.total)}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" component="div" sx={{ mt: 0.5 }}>
                {after! > 0n ? `${formatMoney(formatScaled(after!, 2))} will still be left to bill after this. ` : "This closes the billing of the sale. "}
                CGST/SGST or IGST are set from the client&apos;s state; a draft is created for you to review before issuing.
              </Typography>
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
