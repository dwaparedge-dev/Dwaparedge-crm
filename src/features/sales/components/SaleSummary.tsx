"use client";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import { formatMoney } from "@/lib/format";
import type { SaleRow } from "../service";

type Figures = Pick<SaleRow, "total" | "billed_total" | "paid_on_invoices" | "advance" | "paid_total" | "due_on_invoices" | "unbilled_estimate" | "balance_remaining" | "overpaid">;

function Stat({ label, value, note, color }: { label: string; value: string; note?: string; color?: string }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="h6" sx={{ fontWeight: 700, color }}>{formatMoney(value)}</Typography>
      {note && <Typography variant="caption" color="text.secondary">{note}</Typography>}
    </Box>
  );
}

/** The sale's money in one place: order, billed, paid, what is due and what is left. */
export function SaleSummary({ sale }: { sale: Figures }) {
  const n = (v: string) => Number(v); // display only (bar widths), never used for money
  const order = n(sale.billed_total) + n(sale.unbilled_estimate);
  const paid = n(sale.paid_total);
  const base = Math.max(order, paid, 1);
  const paidPct = (Math.min(paid, order) / base) * 100;
  const billedUnpaidPct = (Math.max(Math.min(n(sale.billed_total), order) - paid, 0) / base) * 100;
  const rest = Math.max(100 - paidPct - billedUnpaidPct, 0);

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Grid container spacing={3}>
          <Grid size={{ xs: 6, md: 2 }}><Stat label="Order value" value={sale.total} note="incl. GST (estimate)" /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><Stat label="Billed" value={sale.billed_total} note="issued invoices" /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><Stat label="Paid" value={sale.paid_total} note={Number(sale.advance) > 0 ? `incl. ${formatMoney(sale.advance)} advance not yet applied` : "payments received"} color="success.main" /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><Stat label="Due on invoices" value={sale.due_on_invoices} note="billed minus paid on them" color={Number(sale.due_on_invoices) > 0 ? "warning.main" : undefined} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><Stat label="Still to bill" value={sale.unbilled_estimate} note="not yet invoiced" /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><Stat label="Balance remaining" value={sale.balance_remaining} note={Number(sale.overpaid) > 0 ? `overpaid by ${formatMoney(sale.overpaid)}` : "billed + to bill − paid"} color="primary.main" /></Grid>
        </Grid>
        <Box sx={{ display: "flex", height: 10, borderRadius: 5, overflow: "hidden", mt: 2, bgcolor: "action.hover" }} role="img"
          aria-label={`${paidPct.toFixed(0)}% paid, ${billedUnpaidPct.toFixed(0)}% billed but unpaid, ${rest.toFixed(0)}% not yet billed`}>
          <Tooltip title={`Paid ${paidPct.toFixed(0)}%`}><Box sx={{ width: `${paidPct}%`, bgcolor: "success.main" }} /></Tooltip>
          <Tooltip title={`Billed, not paid ${billedUnpaidPct.toFixed(0)}%`}><Box sx={{ width: `${billedUnpaidPct}%`, bgcolor: "warning.main" }} /></Tooltip>
          <Tooltip title={`Not yet billed ${rest.toFixed(0)}%`}><Box sx={{ width: `${rest}%` }} /></Tooltip>
        </Box>
        <Box sx={{ display: "flex", gap: 2, mt: 0.75, flexWrap: "wrap" }}>
          {([["success.main", "Paid"], ["warning.main", "Billed, not paid"], ["action.hover", "Not yet billed"]] as const).map(([c, l]) => (
            <Box key={l} sx={{ display: "flex", alignItems: "center", gap: 0.75 }}>
              <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: c }} /><Typography variant="caption" color="text.secondary">{l}</Typography>
            </Box>
          ))}
        </Box>
      </CardContent>
    </Card>
  );
}
