"use client";
import { useMemo } from "react";
import { useFieldArray, useWatch, type Control, type UseFormRegister, type FieldErrors } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { formatMoney } from "@/lib/format";
import { computeLine, formatScaled, parseScaled, sumAmounts } from "@/lib/money";
import type { SaleItemRow } from "@/features/sales/service";
import type { InvoiceFormValues } from "./InvoiceForm";

interface Props {
  control: Control<InvoiceFormValues>;
  register: UseFormRegister<InvoiceFormValues>;
  errors: FieldErrors<InvoiceFormValues>;
  /** The sale's items with how much of each is still free to bill (drafts, including this one, count as billed). */
  saleItems: SaleItemRow[];
  /** Taxable amounts this draft already holds per sale item, so its own lines are not counted against it. */
  ownTaxable: Record<string, string>;
  append: (line: InvoiceFormValues["items"][number]) => void;
  remove: (index: number) => void;
}

const num = { pattern: { value: /^\d+(\.\d+)?$/, message: "Enter a number" } };

/** Invoice lines are tied to the sale: you can bill less of a line, never more than is left. */
export function InvoiceLinesEditor({ control, register, errors, saleItems, ownTaxable, append, remove }: Props) {
  const { fields } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const byId = useMemo(() => new Map(saleItems.map((i) => [i.id, i])), [saleItems]);

  const analysis = useMemo(() => {
    const per = new Map<string, bigint>();
    const lines = (items ?? []).map((it) => {
      try {
        const l = computeLine(it);
        per.set(it.saleItemId, (per.get(it.saleItemId) ?? 0n) + parseScaled(l.taxable, 2));
        return l;
      } catch {
        return null;
      }
    });
    const ok = lines.every((l) => l !== null);
    const valid = lines as NonNullable<(typeof lines)[number]>[];
    return { per, lines, totals: ok ? { subtotal: sumAmounts(valid.map((l) => l.taxable)), tax: sumAmounts(valid.map((l) => l.tax)), total: sumAmounts(valid.map((l) => l.total)) } : null };
  }, [items]);

  const leftFor = (saleItemId: string) => {
    const it = byId.get(saleItemId);
    return it ? parseScaled(it.remaining_taxable, 2) + parseScaled(ownTaxable[saleItemId] ?? "0", 2) : 0n;
  };
  const used = new Set((items ?? []).map((i) => i.saleItemId));
  const addable = saleItems.filter((i) => !used.has(i.id) && parseScaled(i.remaining_taxable, 2) > 0n);

  return (
    <>
      {errors.items?.message && <Alert severity="error" sx={{ mb: 2 }}>{errors.items.message}</Alert>}
      {fields.map((field, idx) => {
        const it = items?.[idx];
        const e = errors.items?.[idx];
        const left = it ? leftFor(it.saleItemId) : 0n;
        const asked = it ? analysis.per.get(it.saleItemId) ?? 0n : 0n;
        const over = asked > left;
        const line = analysis.lines[idx];
        return (
          <Box key={field.id} sx={{ mb: 2, p: 2, border: 1, borderColor: over ? "error.main" : "divider", borderRadius: 2 }}>
            <Grid container spacing={2} sx={{ alignItems: "flex-start" }}>
              <Grid size={{ xs: 12, md: 8 }}>
                <TextField label="Description" required fullWidth {...register(`items.${idx}.description`, { required: "Description is required" })} error={Boolean(e?.description)} helperText={e?.description?.message} />
              </Grid>
              <Grid size={{ xs: 12, md: 4 }}>
                <TextField label="HSN / SAC" fullWidth {...register(`items.${idx}.hsnSac`)} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}><TextField label="Qty" fullWidth inputMode="decimal" {...register(`items.${idx}.quantity`, { required: "Required", ...num })} error={Boolean(e?.quantity)} helperText={e?.quantity?.message} /></Grid>
              <Grid size={{ xs: 6, md: 3 }}><TextField label="Unit price (₹)" fullWidth inputMode="decimal" {...register(`items.${idx}.unitPrice`, { required: "Required", ...num })} error={Boolean(e?.unitPrice)} helperText={e?.unitPrice?.message} /></Grid>
              <Grid size={{ xs: 6, md: 2 }}><TextField label="Discount %" fullWidth inputMode="decimal" {...register(`items.${idx}.discountPercent`, num)} error={Boolean(e?.discountPercent)} helperText={e?.discountPercent?.message} /></Grid>
              <Grid size={{ xs: 6, md: 2 }}><TextField label="GST %" fullWidth inputMode="decimal" {...register(`items.${idx}.taxRate`, num)} error={Boolean(e?.taxRate)} helperText={e?.taxRate?.message} /></Grid>
              <Grid size={{ xs: 10, md: 2 }} sx={{ textAlign: "right", pt: { md: 1 } }}>
                <Typography variant="caption" color="text.secondary">Line total</Typography>
                <Typography sx={{ fontWeight: 600 }}>{line ? formatMoney(line.total) : "—"}</Typography>
              </Grid>
              <Grid size={{ xs: 2, md: 1 }} sx={{ textAlign: "right" }}>
                <IconButton aria-label={`Remove line ${idx + 1}`} disabled={fields.length === 1} onClick={() => remove(idx)}><DeleteIcon /></IconButton>
              </Grid>
              <Grid size={12}>
                <Typography variant="caption" color={over ? "error" : "text.secondary"}>
                  Sale line: {byId.get(it?.saleItemId ?? "")?.description ?? "—"} · this invoice bills {formatMoney(formatScaled(asked, 2))} of the {formatMoney(formatScaled(left, 2))} (before GST) left on it{over ? ": too much, reduce the quantity or price" : ""}
                </Typography>
              </Grid>
            </Grid>
          </Box>
        );
      })}
      {addable.length > 0 && (
        <Autocomplete
          key={fields.length}
          options={addable}
          getOptionLabel={(i) => `${i.description} · ${formatMoney(i.remaining_taxable)} left`}
          onChange={(_, i) => {
            if (!i) return;
            append({ saleItemId: i.id, productId: i.product_id ?? "", description: i.description, hsnSac: i.hsn_sac ?? "", quantity: "1", unitPrice: i.remaining_taxable, discountPercent: "0", taxRate: String(Number(i.tax_rate)) });
          }}
          renderInput={(params) => <TextField {...params} label="Add another line from this sale" size="small" />}
          sx={{ maxWidth: 480 }}
        />
      )}
      <Divider sx={{ my: 2 }} />
      <Box sx={{ ml: "auto", maxWidth: 320 }}>
        {([["Subtotal (after discounts)", analysis.totals?.subtotal], ["GST", analysis.totals?.tax]] as const).map(([label, v]) => (
          <Box key={label} sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}><Typography color="text.secondary">{label}</Typography><Typography>{v ? formatMoney(v) : "—"}</Typography></Box>
        ))}
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}><Typography sx={{ fontWeight: 700 }}>Estimated total</Typography><Typography sx={{ fontWeight: 700 }}>{analysis.totals ? formatMoney(analysis.totals.total) : "—"}</Typography></Box>
        <Typography variant="caption" color="text.secondary">Preview. The server sets the final CGST/SGST or IGST split, round-off and total when you save.</Typography>
      </Box>
    </>
  );
}
