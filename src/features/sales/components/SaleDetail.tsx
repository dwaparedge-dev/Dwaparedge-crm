"use client";
import { DetailPageSkeleton } from "@/components/common/PageSkeletons";
import { useState } from "react";
import Link from "next/link";
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
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { DetailTabPanel, DetailViewHeroSidebar, DetailViewLayout, DetailViewMetricStrip, DetailViewTabs, MasterStatusBadge } from "@/components/shared/DetailView";
import { useRouter } from "next/navigation";
import ListAltIcon from "@mui/icons-material/ListAltOutlined";
import EventNoteIcon from "@mui/icons-material/EventNoteOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import HandshakeIcon from "@mui/icons-material/HandshakeOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import { ErrorState } from "@/components/common/states";
import { HeroActions } from "@/components/common/HeroActions";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { InvoicesList } from "@/features/invoices/components/InvoicesList";
import { PaymentsList } from "@/features/payments/components/PaymentsList";
import type { MilestoneRow, SaleItemRow, SaleRow } from "../service";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import { SaleFormDialog } from "./SaleFormDialog";
import { BILLING_LABEL, PAYMENT_LABEL } from "./common";
import { BillSaleDialog } from "./BillSaleDialog";
import { PlanTab } from "./PlanTab";

type Detail = SaleRow & { items: SaleItemRow[]; milestones: MilestoneRow[] };
type Action = "confirmed" | "completed" | "cancelled";

const COPY: Record<Action, { title: string; message: string; label: string; destructive?: boolean }> = {
  confirmed: { title: "Confirm sale?", message: "Mark this sale as confirmed by the client. Invoices can only be raised against a confirmed sale.", label: "Confirm" },
  completed: { title: "Mark as completed?", message: "A completed sale can no longer be edited or invoiced. This needs everything to be billed.", label: "Mark completed" },
  cancelled: { title: "Cancel sale?", message: "A cancelled sale can no longer be edited or reopened. It must have no invoices and no unallocated advance.", label: "Cancel sale", destructive: true },
};

export function SaleDetail({ id }: { id: string }) {
  const router = useRouter();
  const notify = useNotify();
  const { data: s, error, loading, reload } = useFetch<Detail>(`/api/sales/${id}`);
  const [action, setAction] = useState<Action | null>(null);
  const [billing, setBilling] = useState<{ milestoneId?: string } | null>(null);
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [paymentsKey, setPaymentsKey] = useState(0);
  const [invoicesKey, setInvoicesKey] = useState(0);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !s) return <DetailPageSkeleton />;
  if (!s) return null;

  const editable = s.status === "draft" || s.status === "confirmed";
  const canBill = s.status === "confirmed";

  async function run() {
    if (!action) return;
    setBusy(true);
    try {
      await api(`/api/sales/${id}/status`, { method: "POST", body: { status: action } });
      notify.success(`Sale marked ${action}`);
      setAction(null);
      reload();
    } catch (e) {
      setAction(null);
      notify.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }
  async function applyAdvance() {
    setBusy(true);
    try {
      const r = await api<{ applied: string }>(`/api/sales/${id}/apply-advance`, { method: "POST" });
      notify.success(`${formatMoney(r.applied)} of the advance applied to this sale's invoices`);
      setPaymentsKey((k) => k + 1);
      reload();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not apply the advance");
    } finally {
      setBusy(false);
    }
  }

  const tabs = [
    { key: "items", label: "Items", icon: <ListAltIcon sx={{ fontSize: 18 }} /> },
    { key: "plan", label: "Billing plan", icon: <EventNoteIcon sx={{ fontSize: 18 }} />, count: s.milestones.length || undefined },
    { key: "invoices", label: "Invoices", icon: <ReceiptIcon sx={{ fontSize: 18 }} /> },
    { key: "payments", label: "Payments", icon: <PaymentsIcon sx={{ fontSize: 18 }} /> },
  ];
  const badgeStatus = { draft: "pending", confirmed: "info", completed: "completed", cancelled: "inactive" }[s.status];

  return (
    <>
      <DetailViewLayout
        onBack={() => router.push("/sales")}
        backLabel="Back to Sales"
        sidebar={
          <DetailViewHeroSidebar
            onBack={() => router.push("/sales")}
            backLabel="Back to Sales"
            title={s.sale_number}
            subtitle={s.title}
            subtitleLabel="Title"
            copyValue={s.sale_number}
            avatarIcon={<HandshakeIcon sx={{ fontSize: 32 }} />}
            badges={
              <Box sx={{ display: "flex", gap: 0.75, flexWrap: "wrap" }}>
                <MasterStatusBadge status={badgeStatus} customLabel={s.status.charAt(0).toUpperCase() + s.status.slice(1)} />
                {s.status === "confirmed" || s.status === "completed" ? <MasterStatusBadge status="info" customLabel={`${BILLING_LABEL[s.billing_status]} · ${PAYMENT_LABEL[s.payment_status]}`} /> : null}
              </Box>
            }
            attributes={[
              { label: "Client", value: <Link href={`/clients/${s.client_id}`}>{s.client_name}</Link> },
              { label: "Type", value: <OptionLabel table="sales" column="type" value={s.type} /> },
              { label: "Owner", value: s.owner_name ?? "Unassigned" },
              { label: "Sale date", value: format(new Date(s.sale_date), "dd MMM yyyy") },
              { label: "Expected closing", value: s.expected_close ? format(new Date(s.expected_close), "dd MMM yyyy") : "—" },
              ...(s.notes ? [{ label: "Notes", value: s.notes }] : []),
            ]}
            actions={
              <HeroActions>
                {s.status === "draft" && <Button fullWidth variant="contained" onClick={() => setAction("confirmed")}>Confirm sale</Button>}
                {canBill && <Button fullWidth variant="contained" startIcon={<ReceiptIcon />} onClick={() => setBilling({})} disabled={Number(s.to_bill_taxable) <= 0}>Create invoice</Button>}
                {editable && <Button fullWidth variant="outlined" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit sale</Button>}
                {s.status === "confirmed" && <Button fullWidth variant="outlined" onClick={() => setAction("completed")}>Mark completed</Button>}
                {editable && <Button fullWidth variant="outlined" color="error" onClick={() => setAction("cancelled")}>Cancel sale</Button>}
              </HeroActions>
            }
          />
        }
        metricStrip={
          <DetailViewMetricStrip
            columns={4}
            metrics={[
              { label: "Order value", value: formatMoney(s.total), subtitle: `${formatMoney(s.subtotal)} before GST` },
              { label: "Billed", value: formatMoney(s.billed_total), subtitle: "on issued invoices" },
              { label: "Paid", value: formatMoney(s.paid_total), subtitle: "incl. advance", color: "#10b981" },
              { label: "Balance remaining", value: s.status === "cancelled" ? "—" : formatMoney(s.balance_remaining), subtitle: "still to be received", color: Number(s.balance_remaining) > 0 && s.status !== "cancelled" ? "#f59e0b" : undefined },
            ]}
          />
        }
      >
        {s.status === "draft" && <Alert severity="info" sx={{ mb: 2 }}>This sale is a draft. Confirm it to start invoicing and taking payments against it.</Alert>}
        {s.status === "cancelled" && <Alert severity="error" sx={{ mb: 2 }}>This sale was cancelled.</Alert>}
        {Number(s.advance) > 0 && s.status !== "cancelled" && (
          <Alert severity="info" sx={{ mb: 2 }} action={Number(s.due_on_invoices) > 0 ? <Button color="inherit" size="small" onClick={applyAdvance} disabled={busy}>Apply advance</Button> : undefined}>
            {formatMoney(s.advance)} was received for this sale and is not applied to an invoice yet.{Number(s.due_on_invoices) > 0 ? " Apply it to the invoices that are due." : " It will be available to apply once an invoice is issued."}
          </Alert>
        )}
        <DetailViewTabs tabs={tabs} activeTab={tab} onChange={setTab}>
          <DetailTabPanel value={tab} index={0}>
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>#</TableCell><TableCell>Description</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell>
                    <TableCell align="right">Disc.</TableCell><TableCell align="right">Taxable</TableCell><TableCell align="right">GST</TableCell><TableCell align="right">Total</TableCell>
                    <TableCell align="right">Invoiced</TableCell><TableCell align="right">Left to bill</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {s.items.map((i) => (
                    <TableRow key={i.id}>
                      <TableCell>{i.position}</TableCell>
                      <TableCell>{i.description}{i.hsn_sac && <Box sx={{ color: "text.secondary", fontSize: 12 }}>HSN/SAC {i.hsn_sac}</Box>}</TableCell>
                      <TableCell align="right">{Number(i.quantity)}</TableCell>
                      <TableCell align="right">{formatMoney(i.unit_price)}</TableCell>
                      <TableCell align="right">{Number(i.discount_percent)}%</TableCell>
                      <TableCell align="right">{formatMoney(i.taxable_amount)}</TableCell>
                      <TableCell align="right">{formatMoney(i.tax_amount)} <Box component="span" sx={{ color: "text.secondary", fontSize: 12 }}>({Number(i.tax_rate)}%)</Box></TableCell>
                      <TableCell align="right">{formatMoney(i.line_total)}</TableCell>
                      <TableCell align="right">{formatMoney(String(Number(i.issued_taxable) + Number(i.draft_taxable)))}{Number(i.draft_taxable) > 0 && <Typography variant="caption" color="text.secondary" component="div">{formatMoney(i.draft_taxable)} in drafts</Typography>}</TableCell>
                      <TableCell align="right">{formatMoney(i.remaining_taxable)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 1 }}>Invoiced and left-to-bill are before GST. Totals here are the sale&apos;s estimate; each invoice sets the final CGST/SGST or IGST.</Typography>
            </TableContainer>
          </DetailTabPanel>
          <DetailTabPanel value={tab} index={1}><PlanTab key={s.updated_at + s.milestones.map((m) => m.invoice_id).join()} saleId={id} subtotal={s.subtotal} milestones={s.milestones} editable={editable} onChanged={reload} onBill={(mid) => setBilling({ milestoneId: mid })} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={2}><InvoicesList key={invoicesKey} saleId={id} onChanged={reload}
            saleAction={canBill ? <Button variant="contained" startIcon={<ReceiptIcon />} onClick={() => setBilling({})} disabled={Number(s.to_bill_taxable) <= 0}>Create invoice</Button> : undefined}
            saleEmptyHint={canBill ? "Use “Create invoice” to bill this sale." : s.status === "draft" ? "Confirm the sale first; invoices can only be raised against a confirmed sale." : "Invoices cannot be raised against this sale."} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={3}><PaymentsList key={paymentsKey} clientId={s.client_id} saleId={id} saleNumber={s.sale_number} suggestedAmount={s.due_on_invoices} onChanged={reload} /></DetailTabPanel>
        </DetailViewTabs>
      </DetailViewLayout>

      {action && <ConfirmDialog open title={COPY[action].title} message={COPY[action].message} confirmLabel={COPY[action].label} destructive={COPY[action].destructive} busy={busy} onConfirm={run} onClose={() => setAction(null)} />}
      {billing && <BillSaleDialog saleId={id} subtotal={s.subtotal} items={s.items} milestones={s.milestones} initialMilestoneId={billing.milestoneId} onClose={() => setBilling(null)} onCreated={() => { reload(); setPaymentsKey((k) => k + 1); setInvoicesKey((k) => k + 1); }} />}
      {editing && <SaleFormDialog saleId={id} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); }} />}
    </>
  );
}
