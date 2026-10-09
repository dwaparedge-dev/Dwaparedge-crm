"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
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
import { useNotify } from "@/components/common/Notify";
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { InfoBox, SectionLabel } from "@/components/common/InfoBox";
import { DetailTabPanel, DetailViewHeroSidebar, DetailViewLayout, DetailViewMetricStrip, DetailViewTabs, MasterStatusBadge } from "@/components/shared/DetailView";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import { ErrorState } from "@/components/common/states";
import { HeroActions } from "@/components/common/HeroActions";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { parseScaled } from "@/lib/money";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import type { AllocationRow, PaymentRow } from "../service";
import { AllocationGrid, sumAllocations } from "./AllocationGrid";

type Detail = PaymentRow & { allocations: AllocationRow[] };

function AllocateDialog({ payment, onClose, onDone }: { payment: Detail; onClose: () => void; onDone: () => void }) {
  const notify = useNotify();
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const over = sumAllocations(values) > parseScaled(payment.unallocated, 2);
  const entries = Object.entries(values).filter(([, v]) => v.trim() && Number(v) > 0);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await api(`/api/payments/${payment.id}/allocations`, { method: "POST", body: { allocations: entries.map(([invoiceId, amount]) => ({ invoiceId, amount: amount.trim() })) } });
      notify.success("Payment allocated");
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not allocate");
      setBusy(false);
    }
  }
  return (
    <Dialog open onClose={busy ? undefined : onClose} maxWidth="md" fullWidth>
      <DialogTitle>Allocate {payment.receipt_number}</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <AllocationGrid clientId={payment.client_id} available={payment.unallocated} values={values} onChange={setValues} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={busy}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy || over || entries.length === 0}>{busy ? "Allocating…" : "Allocate"}</Button>
      </DialogActions>
    </Dialog>
  );
}

export function PaymentDetail({ id }: { id: string }) {
  const router = useRouter();
  const [tab, setTab] = useState(0);
  const notify = useNotify();
  const { data: p, error, loading, reload } = useFetch<Detail>(`/api/payments/${id}`);
  const [dialog, setDialog] = useState<"allocate" | "void" | { reverse: AllocationRow } | null>(null);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !p) return <><Skeleton width={300} height={40} /><Skeleton variant="rounded" height={260} sx={{ mt: 2 }} /></>;

  const voided = p.voided_at !== null;
  const hasLive = p.allocations.some((a) => !a.reversed_at);
  const receipt = `/api/payments/${id}/receipt`;
  const tabs = [
    { key: "overview", label: "Overview", icon: <InfoIcon sx={{ fontSize: 18 }} /> },
    { key: "allocations", label: "Allocations", icon: <ReceiptIcon sx={{ fontSize: 18 }} />, count: p.allocations.length || undefined },
  ];

  return (
    <>
      <DetailViewLayout
        onBack={() => router.push("/payments")}
        backLabel="Back to Payments"
        sidebar={
          <DetailViewHeroSidebar
            onBack={() => router.push("/payments")}
            backLabel="Back to Payments"
            title={p.receipt_number}
            titleLabel="Receipt number"
            subtitle={p.client_name}
            subtitleLabel="Client"
            copyValue={p.receipt_number}
            avatarIcon={<PaymentsIcon sx={{ fontSize: 32 }} />}
            badges={<MasterStatusBadge status={voided ? "inactive" : Number(p.unallocated) > 0 ? "pending" : "completed"} customLabel={voided ? "Voided" : Number(p.unallocated) > 0 ? "Advance available" : "Fully allocated"} />}
            attributes={[
              { label: "Client", value: <Link href={`/clients/${p.client_id}`}>{p.client_name}</Link> },
              ...(p.sale_id ? [{ label: "For sale", value: <Link href={`/sales/${p.sale_id}`}>{p.sale_number}</Link> }] : []),
              { label: "Date", value: format(parseISO(p.payment_date), "dd MMM yyyy") },
              { label: "Method", value: <OptionLabel table="payments" column="method" value={p.method} /> },
              { label: "Reference", value: p.reference ?? "—" },
              { label: "Recorded by", value: `${p.recorded_by_name ?? "—"} · ${format(new Date(p.created_at), "dd MMM yyyy")}` },
            ]}
            actions={
              <HeroActions>
                {!voided && Number(p.unallocated) > 0 && <Button fullWidth variant="contained" onClick={() => setDialog("allocate")}>Allocate to invoices</Button>}
                <Button fullWidth variant="outlined" startIcon={<PictureAsPdfIcon />} href={receipt} target="_blank" rel="noopener">View receipt</Button>
                <Button fullWidth variant="outlined" startIcon={<DownloadIcon />} href={`${receipt}?download=1`}>Download receipt</Button>
                {!voided && <Button fullWidth variant="outlined" color="error" onClick={() => setDialog("void")}>Void payment</Button>}
              </HeroActions>
            }
          />
        }
        metricStrip={
          <DetailViewMetricStrip
            columns={3}
            metrics={[
              { label: "Amount received", value: formatMoney(p.amount), subtitle: format(parseISO(p.payment_date), "dd MMM yyyy") },
              { label: "Allocated to invoices", value: formatMoney(p.allocated), subtitle: `${p.allocations.filter((a) => !a.reversed_at).length} active allocation(s)`, color: "#10b981" },
              { label: "Not allocated (advance)", value: voided ? "—" : formatMoney(p.unallocated), subtitle: "available to apply", color: !voided && Number(p.unallocated) > 0 ? "#f59e0b" : undefined },
            ]}
          />
        }
      >
        {voided && <Alert severity="error" sx={{ mb: 2 }}>Voided: {p.void_reason}. This payment no longer counts as collected.</Alert>}
        <DetailViewTabs tabs={tabs} activeTab={tab} onChange={setTab}>
          <DetailTabPanel value={tab} index={0}>
            <SectionLabel>Payment</SectionLabel>
            <Grid container spacing={2}>
              <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Client"><Link href={`/clients/${p.client_id}`}>{p.client_name}</Link></InfoBox></Grid>
              <Grid size={{ xs: 12, md: 6 }}><InfoBox label="For sale">{p.sale_id ? <Link href={`/sales/${p.sale_id}`}>{p.sale_number}</Link> : null}</InfoBox></Grid>
              <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Date">{format(parseISO(p.payment_date), "dd MMM yyyy")}</InfoBox></Grid>
              <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Method"><OptionLabel table="payments" column="method" value={p.method} /></InfoBox></Grid>
              <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Reference">{p.reference}</InfoBox></Grid>
              <Grid size={12}><InfoBox label="Notes">{p.notes}</InfoBox></Grid>
              <Grid size={12}><InfoBox label="Recorded by">{p.recorded_by_name} · {format(new Date(p.created_at), "dd MMM yyyy, hh:mm a")}</InfoBox></Grid>
            </Grid>
          </DetailTabPanel>
          <DetailTabPanel value={tab} index={1}>
          {p.allocations.length === 0 ? <Typography color="text.secondary">Not allocated to any invoice yet.</Typography> : (
            <TableContainer>
              <Table size="small">
                <TableHead><TableRow><TableCell>Invoice</TableCell><TableCell>Allocated</TableCell><TableCell align="right">Amount</TableCell><TableCell>Status</TableCell>{!voided && <TableCell align="right">Action</TableCell>}</TableRow></TableHead>
                <TableBody>
                  {p.allocations.map((a) => (
                    <TableRow key={a.id} sx={{ opacity: a.reversed_at ? 0.55 : 1 }}>
                      <TableCell><Link href={`/invoices/${a.invoice_id}`}>{a.invoice_number}</Link></TableCell>
                      <TableCell>{format(new Date(a.created_at), "dd MMM yyyy")}{a.created_by_name && ` · ${a.created_by_name}`}</TableCell>
                      <TableCell align="right">{formatMoney(a.amount)}</TableCell>
                      <TableCell>{a.reversed_at ? `Reversed: ${a.reverse_reason}` : "Applied"}</TableCell>
                      {!voided && <TableCell align="right">{!a.reversed_at && <Button size="small" color="error" onClick={() => setDialog({ reverse: a })}>Reverse</Button>}</TableCell>}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
            {!voided && hasLive && <Typography variant="caption" color="text.secondary">To correct a wrong allocation, reverse it and allocate again. To void this payment, first reverse all of its allocations.</Typography>}
          </DetailTabPanel>
        </DetailViewTabs>
      </DetailViewLayout>

      {dialog === "allocate" && <AllocateDialog payment={p} onClose={() => setDialog(null)} onDone={() => { setDialog(null); reload(); }} />}
      {dialog === "void" && (
        <ReasonDialog title="Void payment" confirmLabel="Void payment" onClose={() => setDialog(null)}
          message={<>Voiding <strong>{p.receipt_number}</strong> removes it from collected totals. Use this for a payment recorded by mistake, then record the correct one. This cannot be undone.</>}
          onSubmit={async (reason) => { await api(`/api/payments/${id}/void`, { method: "POST", body: { reason } }); notify.success("Payment voided"); setDialog(null); reload(); }} />
      )}
      {typeof dialog === "object" && dialog && (
        <ReasonDialog title="Reverse allocation" confirmLabel="Reverse allocation" onClose={() => setDialog(null)}
          message={<>Reverse the allocation of <strong>{formatMoney(dialog.reverse.amount)}</strong> to invoice <strong>{dialog.reverse.invoice_number}</strong>? The money returns to this payment’s unallocated amount and the invoice balance goes back up.</>}
          onSubmit={async (reason) => { await api(`/api/allocations/${dialog.reverse.id}/reverse`, { method: "POST", body: { reason } }); notify.success("Allocation reversed"); setDialog(null); reload(); }} />
      )}
    </>
  );
}
