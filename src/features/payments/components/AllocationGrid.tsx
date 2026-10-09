"use client";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { format, parseISO } from "date-fns";
import { EmptyState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { formatScaled, parseScaled } from "@/lib/money";
import type { InvoiceRow } from "@/features/invoices/service";

/** Sum of the amounts typed in the grid, in paise (invalid entries count as 0). */
export function sumAllocations(values: Record<string, string>): bigint {
  return Object.values(values).reduce((a, v) => {
    try {
      return a + (v.trim() ? parseScaled(v, 2) : 0n);
    } catch {
      return a;
    }
  }, 0n);
}

interface Props {
  clientId: string;
  /** Amount still available to allocate, as a decimal string. */
  available: string;
  values: Record<string, string>;
  onChange: (values: Record<string, string>) => void;
  focusInvoiceId?: string;
  /** Only list this sale's invoices. */
  saleId?: string;
}

/** Lets the user split a payment across the client's open invoices. */
export function AllocationGrid({ clientId, available, values, onChange, focusInvoiceId, saleId }: Props) {
  const { data, loading, error } = useFetch<{ items: InvoiceRow[] }>(`/api/invoices?clientId=${clientId}&openOnly=true&pageSize=100${saleId ? `&saleId=${saleId}` : ""}`);
  const remaining = parseScaled(available || "0", 2) - sumAllocations(values);

  function autoAllocate() {
    let left = parseScaled(available || "0", 2);
    const next: Record<string, string> = {};
    for (const inv of data?.items ?? []) {
      if (left <= 0n) break;
      const bal = parseScaled(inv.balance_due, 2);
      const take = bal < left ? bal : left;
      next[inv.id] = formatScaled(take, 2);
      left -= take;
    }
    onChange(next);
  }

  /** Keeps an entry within the invoice's balance and within what is left of the payment. */
  function setAmount(inv: InvoiceRow, raw: string) {
    let v = raw;
    if (v.trim() && /^\d*(\.\d{0,2})?$/.test(v.trim())) {
      const others = sumAllocations({ ...values, [inv.id]: "" });
      const cap = parseScaled(inv.balance_due, 2);
      const room = parseScaled(available || "0", 2) - others;
      const max = room < cap ? (room > 0n ? room : 0n) : cap;
      if (parseScaled(v.trim() === "." ? "0" : v, 2) > max) v = formatScaled(max, 2);
    }
    onChange({ ...values, [inv.id]: v });
  }

  if (loading) return <TableSkeleton rows={3} cols={4} />;
  if (error) return <Typography color="error">{error}</Typography>;
  if (!data || data.items.length === 0) return <EmptyState title={saleId ? "No issued invoice with a balance on this sale" : "No open invoices for this client"} hint={saleId ? "The payment will be held as this sale's advance and can be applied when an invoice is issued." : "The payment will be recorded as an advance and can be allocated later."} />;

  return (
    <Box>
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mb: 1, gap: 1, flexWrap: "wrap" }}>
        <Typography variant="body2" color={remaining < 0n ? "error" : "text.secondary"}>
          {remaining < 0n ? `Over-allocated by ${formatMoney(formatScaled(-remaining, 2))}` : `Unallocated: ${formatMoney(formatScaled(remaining, 2))} (kept as an advance)`}
        </Typography>
        <Box sx={{ display: "flex", gap: 1 }}>
          <Button size="small" onClick={autoAllocate}>Allocate oldest first</Button>
          <Button size="small" onClick={() => onChange({})}>Clear</Button>
        </Box>
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow><TableCell>Invoice</TableCell><TableCell>Due</TableCell><TableCell align="right">Balance</TableCell><TableCell align="right" sx={{ width: 150 }}>Allocate</TableCell></TableRow>
        </TableHead>
        <TableBody>
          {data.items.map((inv) => (
            <TableRow key={inv.id} selected={inv.id === focusInvoiceId}>
              <TableCell>{inv.invoice_number}</TableCell>
              <TableCell>{format(parseISO(inv.due_date), "dd MMM yyyy")}{inv.is_overdue && <Typography component="span" color="error" variant="caption"> overdue</Typography>}</TableCell>
              <TableCell align="right">{formatMoney(inv.balance_due)}</TableCell>
              <TableCell align="right">
                <TextField size="small" inputMode="decimal" value={values[inv.id] ?? ""} placeholder="0.00"
                  onChange={(e) => setAmount(inv, e.target.value)} slotProps={{ htmlInput: { "aria-label": `Amount to allocate to ${inv.invoice_number}`, style: { textAlign: "right" } } }} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
}
