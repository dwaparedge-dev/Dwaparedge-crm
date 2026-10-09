"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import Typography from "@mui/material/Typography";
import { format, parseISO } from "date-fns";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { stateNameByCode } from "@/lib/india";
import { PAYMENT_METHOD_LABELS } from "@/features/payments/schema";
import { RecordPaymentDialog } from "@/features/payments/components/RecordPaymentDialog";
import type { InvoiceItemRow, InvoiceRow } from "../service";
import { INVOICE_TYPE_LABELS } from "../schema";
import { InvoiceStatusChip } from "./common";

type Allocation = { id: string; payment_id: string; receipt_number: string; payment_date: string; method: string; amount: string; reversed_at: string | null };
type Detail = InvoiceRow & { items: InvoiceItemRow[]; allocations: Allocation[] };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-line" }}>{children || "—"}</Typography>
    </Box>
  );
}
const Row = ({ label, value, strong }: { label: string; value: string; strong?: boolean }) => (
  <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}>
    <Typography color={strong ? "text.primary" : "text.secondary"} sx={{ fontWeight: strong ? 700 : 400 }}>{label}</Typography>
    <Typography sx={{ fontWeight: strong ? 700 : 400 }}>{value}</Typography>
  </Box>
);

export function InvoiceDetail({ id }: { id: string }) {
  const router = useRouter();
  const notify = useNotify();
  const { data: inv, error, loading, reload } = useFetch<Detail>(`/api/invoices/${id}`);
  const [dialog, setDialog] = useState<"issue" | "cancel" | "delete" | "pay" | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !inv) return <><Skeleton width={300} height={40} /><Skeleton variant="rounded" height={300} sx={{ mt: 2 }} /></>;

  const snap = inv.client_snapshot;
  const isDraft = inv.status === "draft";
  const pdf = `/api/invoices/${id}/pdf`;

  async function issue() {
    setBusy(true);
    try {
      const r = await api<{ invoiceNumber: string }>(`/api/invoices/${id}/issue`, { method: "POST" });
      notify.success(`Invoice ${r.invoiceNumber} issued`);
      setDialog(null);
      reload();
    } catch (e) {
      setDialog(null);
      notify.error(e instanceof Error ? e.message : "Could not issue the invoice");
    } finally {
      setBusy(false);
    }
  }
  async function remove() {
    setBusy(true);
    try {
      await api(`/api/invoices/${id}`, { method: "DELETE" });
      notify.success("Draft deleted");
      router.replace("/invoices");
    } catch (e) {
      setDialog(null);
      notify.error(e instanceof Error ? e.message : "Could not delete the draft");
      setBusy(false);
    }
  }
  async function cancel(reason: string) {
    await api(`/api/invoices/${id}/cancel`, { method: "POST", body: { reason } });
    notify.success("Invoice cancelled");
    setDialog(null);
    reload();
  }

  const live = inv.allocations.filter((a) => !a.reversed_at);
  return (
    <>
      <PageHeader
        title={<>{inv.invoice_number ?? "Draft invoice"} <InvoiceStatusChip invoice={inv} /></>}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Invoices", href: "/invoices" }, { label: inv.invoice_number ?? "Draft" }]}
        actions={
          <>
            <Button variant="outlined" href={pdf} target="_blank" rel="noopener">{isDraft ? "Preview PDF" : "View PDF"}</Button>
            {!isDraft && <Button variant="outlined" href={`${pdf}?download=1`}>Download</Button>}
            {isDraft && <Button component={Link} href={`/invoices/${id}/edit`} variant="outlined">Edit</Button>}
            {isDraft && <Button color="error" variant="outlined" onClick={() => setDialog("delete")}>Delete draft</Button>}
            {isDraft && <Button variant="contained" onClick={() => setDialog("issue")}>Issue invoice</Button>}
            {inv.status === "issued" && Number(inv.balance_due) > 0 && <Button variant="contained" onClick={() => setDialog("pay")}>Record payment</Button>}
            {inv.status === "issued" && <Button color="error" variant="outlined" onClick={() => setDialog("cancel")}>Cancel invoice</Button>}
          </>
        }
      />
      {isDraft && <Alert severity="info" sx={{ mb: 2 }}>Draft: not numbered and not yet a financial record. Review it, then issue it.</Alert>}
      {inv.status === "cancelled" && <Alert severity="error" sx={{ mb: 2 }}>Cancelled on {inv.cancelled_at && format(new Date(inv.cancelled_at), "dd MMM yyyy")}: {inv.cancel_reason}</Alert>}
      {inv.status === "issued" && inv.is_overdue && <Alert severity="warning" sx={{ mb: 2 }}>This invoice was due on {format(parseISO(inv.due_date), "dd MMM yyyy")} and still has a balance of {formatMoney(inv.balance_due)}.</Alert>}

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}>
              <Field label="Client"><Link href={`/clients/${inv.client_id}`}>{snap?.name ?? inv.client_name}</Link>{snap?.gstin && <Box sx={{ color: "text.secondary" }}>GSTIN {snap.gstin}</Box>}</Field>
            </Grid>
            <Grid size={{ xs: 6, md: 2 }}><Field label="Invoice date">{format(parseISO(inv.issue_date), "dd MMM yyyy")}</Field></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Field label="Due date">{format(parseISO(inv.due_date), "dd MMM yyyy")}</Field></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Field label="Type">{INVOICE_TYPE_LABELS[inv.invoice_type as keyof typeof INVOICE_TYPE_LABELS]}</Field></Grid>
            <Grid size={{ xs: 6, md: 2 }}>
              <Field label="Place of supply">{inv.place_of_supply_state_code ? `${stateNameByCode(inv.place_of_supply_state_code)} (${inv.place_of_supply_state_code})` : null}{inv.supply_type && <Box sx={{ color: "text.secondary" }}>{inv.supply_type === "intra" ? "CGST + SGST" : "IGST"}</Box>}</Field>
            </Grid>
            {snap?.billingAddress && <Grid size={{ xs: 12, md: 6 }}><Field label="Billing address">{snap.billingAddress}</Field></Grid>}
            {(inv.payment_terms || inv.notes) && <Grid size={{ xs: 12, md: 6 }}><Field label="Terms & notes">{[inv.payment_terms, inv.notes].filter(Boolean).join("\n")}</Field></Grid>}
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell><TableCell>Description</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Rate</TableCell><TableCell align="right">Disc.</TableCell>
                  <TableCell align="right">Taxable</TableCell><TableCell align="right">GST</TableCell><TableCell align="right">Amount</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {inv.items.map((i) => (
                  <TableRow key={i.id}>
                    <TableCell>{i.position}</TableCell>
                    <TableCell>{i.description}{i.hsn_sac && <Box sx={{ color: "text.secondary", fontSize: 12 }}>HSN/SAC {i.hsn_sac}</Box>}</TableCell>
                    <TableCell align="right">{Number(i.quantity)}</TableCell>
                    <TableCell align="right">{formatMoney(i.unit_price)}</TableCell>
                    <TableCell align="right">{Number(i.discount_percent)}%</TableCell>
                    <TableCell align="right">{formatMoney(i.taxable_amount)}</TableCell>
                    <TableCell align="right">{formatMoney(i.tax_amount)} <Box component="span" sx={{ color: "text.secondary", fontSize: 12 }}>({Number(i.tax_rate)}%)</Box></TableCell>
                    <TableCell align="right">{formatMoney(i.line_total)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ ml: "auto", mt: 2, maxWidth: 340 }}>
            <Row label="Taxable value" value={formatMoney(inv.subtotal)} />
            {inv.supply_type === "intra" ? <><Row label="CGST" value={formatMoney(inv.cgst_total)} /><Row label="SGST" value={formatMoney(inv.sgst_total)} /></> : <Row label="IGST" value={formatMoney(inv.igst_total)} />}
            {Number(inv.round_off) !== 0 && <Row label="Round off" value={formatMoney(inv.round_off)} />}
            <Row label="Grand total" value={formatMoney(inv.total)} strong />
            {inv.status === "issued" && <><Row label="Paid (allocated payments)" value={formatMoney(inv.amount_paid)} /><Row label="Balance due" value={formatMoney(inv.balance_due)} strong /></>}
          </Box>
        </CardContent>
      </Card>

      {!isDraft && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Payments applied</Typography>
            {inv.allocations.length === 0 ? <Typography color="text.secondary">No payments have been allocated to this invoice.</Typography> : (
              <TableContainer>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Receipt</TableCell><TableCell>Date</TableCell><TableCell>Method</TableCell><TableCell align="right">Amount</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                  <TableBody>
                    {inv.allocations.map((a) => (
                      <TableRow key={a.id} sx={{ opacity: a.reversed_at ? 0.55 : 1 }}>
                        <TableCell><Link href={`/payments/${a.payment_id}`}>{a.receipt_number}</Link></TableCell>
                        <TableCell>{format(parseISO(a.payment_date), "dd MMM yyyy")}</TableCell>
                        <TableCell>{PAYMENT_METHOD_LABELS[a.method as keyof typeof PAYMENT_METHOD_LABELS] ?? a.method}</TableCell>
                        <TableCell align="right">{formatMoney(a.amount)}</TableCell>
                        <TableCell>{a.reversed_at ? "Reversed" : "Applied"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {live.length > 0 && <Typography variant="caption" color="text.secondary">To cancel this invoice, first reverse its payment allocations from the payment page.</Typography>}
          </CardContent>
        </Card>
      )}

      <ConfirmDialog open={dialog === "issue"} title="Issue this invoice?" busy={busy} confirmLabel="Issue invoice" onClose={() => setDialog(null)} onConfirm={issue}
        message="An invoice number will be assigned and the invoice becomes a permanent record: it can no longer be edited or deleted, only cancelled with a reason." />
      <ConfirmDialog open={dialog === "delete"} title="Delete this draft?" busy={busy} destructive confirmLabel="Delete draft" onClose={() => setDialog(null)} onConfirm={remove}
        message="The draft has no number and has not been issued. This cannot be undone." />
      {dialog === "cancel" && (
        <ReasonDialog title="Cancel invoice" confirmLabel="Cancel invoice" onClose={() => setDialog(null)} onSubmit={cancel}
          message={<>Cancelling <strong>{inv.invoice_number}</strong> keeps its number and record but removes it from outstanding balances. This cannot be undone.</>} />
      )}
      {dialog === "pay" && (
        <RecordPaymentDialog clientId={inv.client_id} focusInvoiceId={inv.id} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} />
      )}
    </>
  );
}
