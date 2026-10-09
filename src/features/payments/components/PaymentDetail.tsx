"use client";
import { useState } from "react";
import Link from "next/link";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
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
import { PageHeader } from "@/components/common/PageHeader";
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { parseScaled } from "@/lib/money";
import { PAYMENT_METHOD_LABELS } from "../schema";
import type { AllocationRow, PaymentRow } from "../service";
import { AllocationGrid, sumAllocations } from "./AllocationGrid";

type Detail = PaymentRow & { allocations: AllocationRow[] };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" component="div">{children || "—"}</Typography>
    </Box>
  );
}

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
  const notify = useNotify();
  const { data: p, error, loading, reload } = useFetch<Detail>(`/api/payments/${id}`);
  const [dialog, setDialog] = useState<"allocate" | "void" | { reverse: AllocationRow } | null>(null);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !p) return <><Skeleton width={300} height={40} /><Skeleton variant="rounded" height={260} sx={{ mt: 2 }} /></>;

  const voided = p.voided_at !== null;
  const hasLive = p.allocations.some((a) => !a.reversed_at);
  const receipt = `/api/payments/${id}/receipt`;

  return (
    <>
      <PageHeader
        title={<>{p.receipt_number} {voided && <Typography component="span" color="error" variant="subtitle1">Voided</Typography>}</>}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Payments", href: "/payments" }, { label: p.receipt_number }]}
        actions={
          <>
            <Button variant="outlined" href={receipt} target="_blank" rel="noopener">View receipt</Button>
            <Button variant="outlined" href={`${receipt}?download=1`}>Download receipt</Button>
            {!voided && Number(p.unallocated) > 0 && <Button variant="contained" onClick={() => setDialog("allocate")}>Allocate to invoices</Button>}
            {!voided && <Button color="error" variant="outlined" onClick={() => setDialog("void")}>Void payment</Button>}
          </>
        }
      />
      {voided && <Alert severity="error" sx={{ mb: 2 }}>Voided: {p.void_reason}. This payment no longer counts as collected.</Alert>}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}><Field label="Client"><Link href={`/clients/${p.client_id}`}>{p.client_name}</Link></Field></Grid>
            <Grid size={{ xs: 6, md: 2 }}><Field label="Date">{format(parseISO(p.payment_date), "dd MMM yyyy")}</Field></Grid>
            <Grid size={{ xs: 6, md: 3 }}><Field label="Method">{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method}</Field></Grid>
            <Grid size={{ xs: 12, md: 3 }}><Field label="Reference">{p.reference}</Field></Grid>
            <Grid size={{ xs: 6, md: 4 }}><Field label="Amount received"><strong>{formatMoney(p.amount)}</strong></Field></Grid>
            <Grid size={{ xs: 6, md: 4 }}><Field label="Allocated to invoices">{formatMoney(p.allocated)}</Field></Grid>
            <Grid size={{ xs: 12, md: 4 }}><Field label="Not allocated (advance)">{voided ? "—" : formatMoney(p.unallocated)}</Field></Grid>
            <Grid size={{ xs: 12, md: 8 }}><Field label="Notes">{p.notes}</Field></Grid>
            <Grid size={{ xs: 12, md: 4 }}><Field label="Recorded by">{p.recorded_by_name} · {format(new Date(p.created_at), "dd MMM yyyy, hh:mm a")}</Field></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Allocations</Typography>
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
        </CardContent>
      </Card>

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
