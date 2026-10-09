"use client";
import { useMemo } from "react";
import { useFieldArray, useWatch, type UseFormReturn } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Divider from "@mui/material/Divider";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { computeLine, sumAmounts } from "@/lib/money";
import type { ProductRow } from "@/features/products/service";

export interface LineItem {
  /** Set for items that already exist on the saved sale (keeps their identity for invoicing). */
  itemId?: string;
  /** Taxable amount already on invoices (read-only hint; not sent). */
  billed?: string;
  productId: string;
  description: string;
  hsnSac: string;
  quantity: string;
  unitPrice: string;
  discountPercent: string;
  taxRate: string;
}
export interface ItemsForm {
  items: LineItem[];
}
export const EMPTY_LINE: LineItem = { productId: "", description: "", hsnSac: "", quantity: "1", unitPrice: "0", discountPercent: "0", taxRate: "18" };

function preview(i: LineItem) {
  try {
    return computeLine(i);
  } catch {
    return null;
  }
}

/** Live totals for the given items; null while any row has an unparsable number. */
export function useItemsTotals(items: LineItem[] | undefined) {
  return useMemo(() => {
    const lines = (items ?? []).map(preview);
    if (lines.some((l) => l === null)) return null;
    const ok = lines as NonNullable<(typeof lines)[number]>[];
    return { subtotal: sumAmounts(ok.map((l) => l.taxable)), tax: sumAmounts(ok.map((l) => l.tax)), total: sumAmounts(ok.map((l) => l.total)), lines: ok };
  }, [items]);
}

interface Props {
  form: UseFormReturn<ItemsForm>;
  initialItems: LineItem[];
  totalLabel: string;
  footnote: string;
}

export function LineItemsEditor({ form, initialItems, totalLabel, footnote }: Props) {
  const { register, control, setValue, formState: { errors } } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "items" });
  const items = useWatch({ control, name: "items" });
  const totals = useItemsTotals(items);
  const products = useFetch<{ items: ProductRow[] }>("/api/products?active=true&pageSize=100");

  function pickProduct(idx: number, p: ProductRow | null) {
    setValue(`items.${idx}.productId`, p?.id ?? "");
    if (!p) return;
    setValue(`items.${idx}.description`, p.name);
    setValue(`items.${idx}.hsnSac`, p.hsn_sac ?? "");
    setValue(`items.${idx}.unitPrice`, p.default_price);
    setValue(`items.${idx}.taxRate`, String(Number(p.gst_rate)));
  }
  const num = { pattern: { value: /^\d+(\.\d+)?$/, message: "Enter a number" } };

  return (
    <>
      {errors.items?.message && <Alert severity="error" sx={{ mb: 2 }}>{errors.items.message}</Alert>}
      {fields.map((field, idx) => {
        const line = totals?.lines[idx];
        const e = errors.items?.[idx];
        return (
          <Box key={field.id} sx={{ mb: 2, p: 2, border: 1, borderColor: "divider", borderRadius: 2 }}>
            <Grid container spacing={2} sx={{ alignItems: "flex-start" }}>
              <Grid size={{ xs: 12, md: 4 }}>
                <Autocomplete
                  options={products.data?.items ?? []}
                  loading={products.loading}
                  getOptionLabel={(p) => p.name}
                  defaultValue={products.data?.items.find((p) => p.id === initialItems[idx]?.productId) ?? null}
                  onChange={(_, p) => pickProduct(idx, p)}
                  renderInput={(params) => <TextField {...params} label="Catalog item (optional)" />}
                />
              </Grid>
              <Grid size={{ xs: 12, md: 6 }}>
                <TextField label="Description" required fullWidth {...register(`items.${idx}.description`, { required: "Description is required" })} error={Boolean(e?.description)} helperText={e?.description?.message} />
              </Grid>
              <Grid size={{ xs: 12, md: 2 }}>
                <TextField label="HSN / SAC" fullWidth {...register(`items.${idx}.hsnSac`)} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField label="Qty" fullWidth inputMode="decimal" {...register(`items.${idx}.quantity`, { required: "Required", ...num })} error={Boolean(e?.quantity)} helperText={e?.quantity?.message} />
              </Grid>
              <Grid size={{ xs: 6, md: 3 }}>
                <TextField label="Unit price (₹)" fullWidth inputMode="decimal" {...register(`items.${idx}.unitPrice`, { required: "Required", ...num })} error={Boolean(e?.unitPrice)} helperText={e?.unitPrice?.message} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField label="Discount %" fullWidth inputMode="decimal" {...register(`items.${idx}.discountPercent`, num)} error={Boolean(e?.discountPercent)} helperText={e?.discountPercent?.message} />
              </Grid>
              <Grid size={{ xs: 6, md: 2 }}>
                <TextField label="GST %" fullWidth inputMode="decimal" {...register(`items.${idx}.taxRate`, num)} error={Boolean(e?.taxRate)} helperText={e?.taxRate?.message} />
              </Grid>
              <Grid size={{ xs: 10, md: 2 }} sx={{ textAlign: "right", pt: { md: 1 } }}>
                <Typography variant="caption" color="text.secondary">Line total</Typography>
                <Typography sx={{ fontWeight: 600 }}>{line ? formatMoney(line.total) : "—"}</Typography>
                {Number(items?.[idx]?.billed ?? 0) > 0 && <Typography variant="caption" color="warning.main" component="div">{formatMoney(items![idx]!.billed!)} already invoiced (before GST): this line can’t go below that or be removed</Typography>}
              </Grid>
              <Grid size={{ xs: 2, md: 1 }} sx={{ textAlign: "right" }}>
                <IconButton aria-label={`Remove item ${idx + 1}`} disabled={fields.length === 1 || Number(items?.[idx]?.billed ?? 0) > 0} onClick={() => remove(idx)}><DeleteIcon /></IconButton>
              </Grid>
            </Grid>
          </Box>
        );
      })}
      <Button startIcon={<AddIcon />} onClick={() => append({ ...EMPTY_LINE })}>Add item</Button>
      <Divider sx={{ my: 2 }} />
      <Box sx={{ ml: "auto", maxWidth: 320 }}>
        {([["Subtotal (after discounts)", totals?.subtotal], ["GST", totals?.tax]] as const).map(([label, v]) => (
          <Box key={label} sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
            <Typography color="text.secondary">{label}</Typography><Typography>{v ? formatMoney(v) : "—"}</Typography>
          </Box>
        ))}
        <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
          <Typography sx={{ fontWeight: 700 }}>{totalLabel}</Typography><Typography sx={{ fontWeight: 700 }}>{totals ? formatMoney(totals.total) : "—"}</Typography>
        </Box>
        <Typography variant="caption" color="text.secondary">{footnote}</Typography>
      </Box>
    </>
  );
}
