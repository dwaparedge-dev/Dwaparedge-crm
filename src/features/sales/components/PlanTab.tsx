"use client";
import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import IconButton from "@mui/material/IconButton";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import { useNotify } from "@/components/common/Notify";
import { api, ApiError } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { milestoneTaxable } from "@/lib/billing";
import { formatScaled, parseScaled } from "@/lib/money";
import type { MilestoneRow } from "../service";

interface Row {
  id?: string;
  title: string;
  basis: "percent" | "amount";
  value: string;
  dueDate: string;
  locked: boolean;
  invoice?: Pick<MilestoneRow, "invoice_id" | "invoice_number" | "invoice_status" | "invoice_total" | "invoice_paid">;
}

const fromMilestone = (m: MilestoneRow): Row => ({
  id: m.id, title: m.title, basis: m.basis, value: m.basis === "percent" ? String(Number(m.percent)) : m.amount!, dueDate: m.due_date ?? "",
  locked: Boolean(m.invoice_id), invoice: m,
});

export function PlanTab({ saleId, subtotal, milestones, editable, onChanged, onBill }: {
  saleId: string; subtotal: string; milestones: MilestoneRow[]; editable: boolean; onChanged: () => void; onBill: (milestoneId: string) => void;
}) {
  const notify = useNotify();
  const [rows, setRows] = useState<Row[]>(() => milestones.map(fromMilestone));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dirty = JSON.stringify(rows.map(({ invoice, ...r }) => { void invoice; return r; })) !== JSON.stringify(milestones.map(fromMilestone).map(({ invoice, ...r }) => { void invoice; return r; }));

  const planned = (() => {
    try {
      return rows.reduce((a, r) => a + (r.value && /^\d+(\.\d+)?$/.test(r.value) ? milestoneTaxable({ basis: r.basis, percent: r.basis === "percent" ? r.value : null, amount: r.basis === "amount" ? r.value : null }, subtotal) : 0n), 0n);
    } catch {
      return 0n;
    }
  })();
  const total = parseScaled(subtotal, 2);
  const over = planned > total;
  const pct = total > 0n ? Number((planned * 10000n) / total) / 100 : 0;
  const set = (i: number, patch: Partial<Row>) => setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/sales/${saleId}/milestones`, {
        method: "PUT",
        body: { milestones: rows.map((r) => ({ id: r.id, title: r.title, basis: r.basis, percent: r.basis === "percent" ? r.value : "", amount: r.basis === "amount" ? r.value : "", dueDate: r.dueDate })) },
      });
      notify.success("Billing plan saved");
      onChanged();
    } catch (e) {
      setError(e instanceof ApiError && e.details?.issues?.length ? e.details.issues.map((i) => i.message).join(" · ") : e instanceof Error ? e.message : "Could not save the plan");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Split the sale into instalments, by percentage or by a fixed amount before GST. Each instalment becomes its own invoice when you bill it. The last instalment of a plan that covers the whole sale takes the exact remainder, so rounding never leaves paise behind.
      </Typography>
      {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
      {rows.length === 0 ? <Typography color="text.secondary" sx={{ py: 2 }}>No billing plan. You can still bill the whole sale, a percentage or an amount from “Create invoice”.</Typography> : (
        <TableContainer>
          <Table size="small">
            <TableHead><TableRow><TableCell>Instalment</TableCell><TableCell>Basis</TableCell><TableCell>Value</TableCell><TableCell>Due date</TableCell><TableCell>Invoice</TableCell><TableCell align="right">Action</TableCell></TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={r.id ?? `new-${i}`}>
                  <TableCell><TextField size="small" value={r.title} disabled={r.locked || !editable} onChange={(e) => set(i, { title: e.target.value })} placeholder="e.g. Advance" slotProps={{ htmlInput: { "aria-label": "Instalment name" } }} /></TableCell>
                  <TableCell><TextField select size="small" value={r.basis} disabled={r.locked || !editable} onChange={(e) => set(i, { basis: e.target.value as Row["basis"] })} sx={{ minWidth: 130 }}><MenuItem value="percent">Percentage</MenuItem><MenuItem value="amount">Amount (before GST)</MenuItem></TextField></TableCell>
                  <TableCell><TextField size="small" value={r.value} disabled={r.locked || !editable} onChange={(e) => set(i, { value: e.target.value })} inputMode="decimal" sx={{ width: 120 }} slotProps={{ htmlInput: { "aria-label": "Instalment value" } }} /></TableCell>
                  <TableCell><TextField size="small" type="date" value={r.dueDate} disabled={r.locked || !editable} onChange={(e) => set(i, { dueDate: e.target.value })} slotProps={{ htmlInput: { "aria-label": "Due date" } }} /></TableCell>
                  <TableCell>
                    {r.invoice?.invoice_id ? (
                      <Box>
                        <Link href={`/invoices/${r.invoice.invoice_id}`}>{r.invoice.invoice_number ?? "Draft"}</Link>
                        <Typography variant="caption" color="text.secondary" component="div">
                          {r.invoice.invoice_status === "issued" ? `${formatMoney(r.invoice.invoice_total)} · paid ${formatMoney(r.invoice.invoice_paid)}` : "Draft, not issued"}
                        </Typography>
                      </Box>
                    ) : <Typography variant="body2" color="text.secondary">Planned</Typography>}
                  </TableCell>
                  <TableCell align="right">
                    {r.id && !r.invoice?.invoice_id && editable && !dirty && <Button size="small" onClick={() => onBill(r.id!)}>Create invoice</Button>}
                    {!r.locked && editable && <IconButton aria-label="Remove instalment" onClick={() => setRows((rs) => rs.filter((_, idx) => idx !== i))}><DeleteIcon fontSize="small" /></IconButton>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Box sx={{ display: "flex", justifyContent: "space-between", alignItems: "center", mt: 2, flexWrap: "wrap", gap: 1 }}>
        <Typography variant="body2" color={over ? "error" : "text.secondary"}>
          Planned: {formatMoney(formatScaled(planned, 2))} of {formatMoney(subtotal)} before GST ({pct}%){over ? ": more than the sale" : pct < 100 && rows.length ? ": the rest can still be billed separately" : ""}
        </Typography>
        {editable && (
          <Box sx={{ display: "flex", gap: 1 }}>
            <Button startIcon={<AddIcon />} onClick={() => setRows((rs) => [...rs, { title: "", basis: "percent", value: "", dueDate: "", locked: false }])}>Add instalment</Button>
            <Button variant="contained" onClick={save} disabled={busy || !dirty || over}>{busy ? "Saving…" : "Save plan"}</Button>
          </Box>
        )}
      </Box>
      {dirty && editable && <Typography variant="caption" color="text.secondary">Save the plan before creating an invoice from an instalment.</Typography>}
    </Box>
  );
}
