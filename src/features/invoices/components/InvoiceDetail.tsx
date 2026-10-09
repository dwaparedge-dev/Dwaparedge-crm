"use client";
import { DetailPageSkeleton } from "@/components/common/PageSkeletons";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { DetailTabPanel, DetailViewHeroSidebar, DetailViewLayout, DetailViewMetricStrip, DetailViewTabs, MasterStatusBadge } from "@/components/shared/DetailView";
import ListAltIcon from "@mui/icons-material/ListAltOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import { ErrorState } from "@/components/common/states";
import { HeroActions } from "@/components/common/HeroActions";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { stateNameByCode } from "@/lib/india";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import { RecordPaymentDialog } from "@/features/payments/components/RecordPaymentDialog";
import type { InvoiceItemRow, InvoiceRow } from "../service";
import { InvoiceFormDialog } from "./InvoiceFormDialog";

type Allocation = { id: string; payment_id: string; receipt_number: string; payment_date: string; method: string; amount: string; reversed_at: string | null };
type Detail = InvoiceRow & { items: InvoiceItemRow[]; allocations: Allocation[] };

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
  const sale = useFetch<{ advance: string; sale_number: string }>(inv ? `/api/sales/${inv.sale_id}` : null);
  const [dialog, setDialog] = useState<"issue" | "cancel" | "delete" | "pay" | null>(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  const [tab, setTab] = useState(0);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !inv) return <DetailPageSkeleton />;
  if (!inv) return null;

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
  async function applyAdvance() {
    setBusy(true);
    try {
      const r = await api<{ applied: string }>(`/api/sales/${inv!.sale_id}/apply-advance`, { method: "POST", body: { invoiceId: id } });
      notify.success(`${formatMoney(r.applied)} of the sale's advance applied to this invoice`);
      reload();
      sale.reload();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not apply the advance");
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
  const statusLabel = isDraft ? "Draft" : inv.status === "cancelled" ? "Cancelled" : inv.payment_status === "paid" ? "Paid" : inv.is_overdue ? (inv.payment_status === "partial" ? "Overdue · partial" : "Overdue") : inv.payment_status === "partial" ? "Partially paid" : "Unpaid";
  const statusKey = isDraft ? "pending" : inv.status === "cancelled" ? "inactive" : inv.payment_status === "paid" ? "completed" : inv.is_overdue ? "warning" : "info";
  const tabs = [
    { key: "lines", label: "Invoice lines", icon: <ListAltIcon sx={{ fontSize: 18 }} /> },
    ...(!isDraft ? [{ key: "payments", label: "Payments applied", icon: <PaymentsIcon sx={{ fontSize: 18 }} />, count: live.length || undefined }] : []),
  ];
  return (
    <>
      <DetailViewLayout
        onBack={() => router.push("/invoices")}
        backLabel="Back to Invoices"
        sidebar={
          <DetailViewHeroSidebar
            onBack={() => router.push("/invoices")}
            backLabel="Back to Invoices"
            title={inv.invoice_number ?? "Draft invoice"}
            titleLabel="Invoice number"
            subtitle={snap?.name ?? inv.client_name}
            subtitleLabel="Client"
            copyValue={inv.invoice_number ?? undefined}
            avatarIcon={<ReceiptIcon sx={{ fontSize: 32 }} />}
            badges={<MasterStatusBadge status={statusKey} customLabel={statusLabel} />}
            attributes={[
              { label: "Client", value: <Link href={`/clients/${inv.client_id}`}>{snap?.name ?? inv.client_name}</Link> },
              ...(snap?.gstin ? [{ label: "Client GSTIN", value: snap.gstin, isMonospace: true }] : []),
              { label: "Sale", value: <Link href={`/sales/${inv.sale_id}`}>{inv.sale_number}</Link> },
              { label: "Invoice date", value: format(parseISO(inv.issue_date), "dd MMM yyyy") },
              { label: "Due date", value: format(parseISO(inv.due_date), "dd MMM yyyy") },
              { label: "Place of supply", value: inv.place_of_supply_state_code ? `${stateNameByCode(inv.place_of_supply_state_code)} (${inv.place_of_supply_state_code})` : "—" },
              ...(inv.supply_type ? [{ label: "Tax type", value: inv.supply_type === "intra" ? "CGST + SGST" : "IGST" }] : []),
              ...(snap?.billingAddress ? [{ label: "Billing address", value: snap.billingAddress }] : []),
              ...(inv.payment_terms || inv.notes ? [{ label: "Terms & notes", value: [inv.payment_terms, inv.notes].filter(Boolean).join("\n") }] : []),
            ]}
            actions={
              <HeroActions>
                {isDraft && <Button fullWidth variant="contained" onClick={() => setDialog("issue")}>Issue invoice</Button>}
                {inv.status === "issued" && Number(inv.balance_due) > 0 && <Button fullWidth variant="contained" onClick={() => setDialog("pay")}>Record payment</Button>}
                <Button fullWidth variant="outlined" startIcon={<PictureAsPdfIcon />} href={pdf} target="_blank" rel="noopener">{isDraft ? "Preview PDF" : "View PDF"}</Button>
                {!isDraft && <Button fullWidth variant="outlined" startIcon={<DownloadIcon />} href={`${pdf}?download=1`}>Download</Button>}
                {isDraft && <Button fullWidth variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit draft</Button>}
                {isDraft && <Button fullWidth variant="outlined" color="error" onClick={() => setDialog("delete")}>Delete draft</Button>}
                {inv.status === "issued" && <Button fullWidth variant="outlined" color="error" onClick={() => setDialog("cancel")}>Cancel invoice</Button>}
              </HeroActions>
            }
          />
        }
        metricStrip={
          <DetailViewMetricStrip
            columns={4}
            metrics={[
              { label: "Taxable value", value: formatMoney(inv.subtotal), subtitle: "before GST" },
              { label: "GST", value: formatMoney(inv.tax_total), subtitle: inv.supply_type === "intra" ? "CGST + SGST" : inv.supply_type === "inter" ? "IGST" : undefined },
              { label: "Invoice total", value: formatMoney(inv.total), subtitle: "grand total" },
              inv.status === "issued"
                ? { label: "Balance due", value: formatMoney(inv.balance_due), subtitle: `${formatMoney(inv.amount_paid)} paid`, color: Number(inv.balance_due) > 0 ? "#f59e0b" : "#10b981" }
                : { label: "Status", value: statusLabel, subtitle: isDraft ? "not yet issued" : "no longer payable" },
            ]}
          />
        }
      >
        {inv.status === "issued" && Number(sale.data?.advance ?? 0) > 0 && Number(inv.balance_due) > 0 && (
        <Alert severity="info" sx={{ mb: 2 }} action={<Button color="inherit" size="small" onClick={applyAdvance} disabled={busy}>Apply advance</Button>}>
          {formatMoney(sale.data!.advance)} was received in advance for sale {inv.sale_number}. Apply it to this invoice.
        </Alert>
      )}
        {isDraft && <Alert severity="info" sx={{ mb: 2 }}>Draft: not numbered and not yet a financial record. Review it, then issue it.</Alert>}
        {inv.status === "cancelled" && <Alert severity="error" sx={{ mb: 2 }}>Cancelled on {inv.cancelled_at && format(new Date(inv.cancelled_at), "dd MMM yyyy")}: {inv.cancel_reason}</Alert>}
        {inv.status === "issued" && inv.is_overdue && <Alert severity="warning" sx={{ mb: 2 }}>This invoice was due on {format(parseISO(inv.due_date), "dd MMM yyyy")} and still has a balance of {formatMoney(inv.balance_due)}.</Alert>}

        <DetailViewTabs tabs={tabs} activeTab={Math.min(tab, tabs.length - 1)} onChange={setTab}>
          <DetailTabPanel value={tab} index={0}>
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
          </DetailTabPanel>
          {!isDraft && (
            <DetailTabPanel value={tab} index={1}>
            {inv.allocations.length === 0 ? <Typography color="text.secondary">No payments have been allocated to this invoice.</Typography> : (
              <TableContainer>
                <Table size="small">
                  <TableHead><TableRow><TableCell>Receipt</TableCell><TableCell>Date</TableCell><TableCell>Method</TableCell><TableCell align="right">Amount</TableCell><TableCell>Status</TableCell></TableRow></TableHead>
                  <TableBody>
                    {inv.allocations.map((a) => (
                      <TableRow key={a.id} sx={{ opacity: a.reversed_at ? 0.55 : 1 }}>
                        <TableCell><Link href={`/payments/${a.payment_id}`}>{a.receipt_number}</Link></TableCell>
                        <TableCell>{format(parseISO(a.payment_date), "dd MMM yyyy")}</TableCell>
                        <TableCell><OptionLabel table="payments" column="method" value={a.method} /></TableCell>
                        <TableCell align="right">{formatMoney(a.amount)}</TableCell>
                        <TableCell>{a.reversed_at ? "Reversed" : "Applied"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            {live.length > 0 && <Typography variant="caption" color="text.secondary">To cancel this invoice, first reverse its payment allocations from the payment page.</Typography>}
            </DetailTabPanel>
          )}
        </DetailViewTabs>
      </DetailViewLayout>

      <ConfirmDialog open={dialog === "issue"} title="Issue this invoice?" busy={busy} confirmLabel="Issue invoice" onClose={() => setDialog(null)} onConfirm={issue}
        message="An invoice number will be assigned and the invoice becomes a permanent record: it can no longer be edited or deleted, only cancelled with a reason." />
      <ConfirmDialog open={dialog === "delete"} title="Delete this draft?" busy={busy} destructive confirmLabel="Delete draft" onClose={() => setDialog(null)} onConfirm={remove}
        message="The draft has no number and has not been issued. This cannot be undone." />
      {dialog === "cancel" && (
        <ReasonDialog title="Cancel invoice" confirmLabel="Cancel invoice" onClose={() => setDialog(null)} onSubmit={cancel}
          message={<>Cancelling <strong>{inv.invoice_number}</strong> keeps its number and record but removes it from outstanding balances. This cannot be undone.</>} />
      )}
      {dialog === "pay" && (
        <RecordPaymentDialog clientId={inv.client_id} saleId={inv.sale_id} saleNumber={inv.sale_number} suggestedAmount={inv.balance_due} focusInvoiceId={inv.id} onClose={() => setDialog(null)} onSaved={() => { setDialog(null); reload(); }} />
      )}
      {editing && <InvoiceFormDialog invoiceId={id} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
