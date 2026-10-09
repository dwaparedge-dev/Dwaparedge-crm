"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { SaleItemRow, SaleRow } from "../service";
import { SALE_TYPE_LABELS, SaleStatusChip } from "./common";

type Detail = SaleRow & { items: SaleItemRow[] };
type Action = "confirmed" | "completed" | "cancelled";

const COPY: Record<Action, { title: string; message: string; label: string; destructive?: boolean }> = {
  confirmed: { title: "Confirm sale?", message: "Mark this sale as confirmed by the client.", label: "Confirm" },
  completed: { title: "Mark as completed?", message: "A completed sale can no longer be edited.", label: "Mark completed" },
  cancelled: { title: "Cancel sale?", message: "A cancelled sale can no longer be edited or reopened.", label: "Cancel sale", destructive: true },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" component="div" sx={{ whiteSpace: "pre-line" }}>{children || "—"}</Typography>
    </Box>
  );
}

export function SaleDetail({ id }: { id: string }) {
  const notify = useNotify();
  const router = useRouter();
  const { data: s, error, loading, reload } = useFetch<Detail>(`/api/sales/${id}`);
  const [action, setAction] = useState<Action | null>(null);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !s) return <><Skeleton width={260} height={40} /><Skeleton variant="rounded" height={300} sx={{ mt: 2 }} /></>;

  const editable = s.status === "draft" || s.status === "confirmed";

  async function createInvoice() {
    setBusy(true);
    try {
      const r = await api<{ id: string }>(`/api/sales/${id}/invoice`, { method: "POST" });
      notify.success("Draft invoice created from this sale. Review it, then issue it.");
      router.push(`/invoices/${r.id}`);
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not create the invoice");
      setBusy(false);
    }
  }

  async function run() {
    if (!action) return;
    setBusy(true);
    try {
      await api(`/api/sales/${id}/status`, { method: "POST", body: { status: action } });
      notify.success(`Sale marked ${action}`);
      setAction(null);
      reload();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={<>{s.sale_number} <SaleStatusChip status={s.status} /></>}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Sales", href: "/sales" }, { label: s.sale_number }]}
        actions={
          <>
            {s.status !== "cancelled" && <Button variant="outlined" onClick={createInvoice} disabled={busy}>Create invoice</Button>}
            {editable && <Button component={Link} href={`/sales/${id}/edit`} variant="outlined">Edit</Button>}
            {s.status === "draft" && <Button variant="contained" onClick={() => setAction("confirmed")}>Confirm</Button>}
            {s.status === "confirmed" && <Button variant="contained" onClick={() => setAction("completed")}>Mark completed</Button>}
            {editable && <Button color="error" variant="outlined" onClick={() => setAction("cancelled")}>Cancel sale</Button>}
          </>
        }
      />
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" sx={{ mb: 2 }}>{s.title}</Typography>
          <Grid container spacing={3}>
            <Grid size={{ xs: 12, md: 4 }}><Field label="Client"><Link href={`/clients/${s.client_id}`}>{s.client_name}</Link></Field></Grid>
            <Grid size={{ xs: 6, md: 4 }}><Field label="Type">{SALE_TYPE_LABELS[s.type] ?? s.type}</Field></Grid>
            <Grid size={{ xs: 6, md: 4 }}><Field label="Owner">{s.owner_name}</Field></Grid>
            <Grid size={{ xs: 6, md: 4 }}><Field label="Sale date">{format(new Date(s.sale_date), "dd MMM yyyy")}</Field></Grid>
            <Grid size={{ xs: 6, md: 4 }}><Field label="Expected closing">{s.expected_close ? format(new Date(s.expected_close), "dd MMM yyyy") : null}</Field></Grid>
            <Grid size={12}><Field label="Notes">{s.notes}</Field></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>Items</Typography>
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>#</TableCell><TableCell>Description</TableCell><TableCell align="right">Qty</TableCell><TableCell align="right">Unit price</TableCell>
                  <TableCell align="right">Disc.</TableCell><TableCell align="right">Taxable</TableCell><TableCell align="right">GST</TableCell><TableCell align="right">Total</TableCell>
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
          <Box sx={{ ml: "auto", mt: 2, maxWidth: 320 }}>
            <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}><Typography color="text.secondary">Subtotal (after discounts)</Typography><Typography>{formatMoney(s.subtotal)}</Typography></Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}><Typography color="text.secondary">GST</Typography><Typography>{formatMoney(s.tax_total)}</Typography></Box>
            <Box sx={{ display: "flex", justifyContent: "space-between", py: 0.5 }}><Typography sx={{ fontWeight: 700 }}>Estimated total</Typography><Typography sx={{ fontWeight: 700 }}>{formatMoney(s.total)}</Typography></Box>
          </Box>
        </CardContent>
      </Card>
      {action && (
        <ConfirmDialog open title={COPY[action].title} message={COPY[action].message} confirmLabel={COPY[action].label} destructive={COPY[action].destructive}
          busy={busy} onConfirm={run} onClose={() => setAction(null)} />
      )}
    </>
  );
}
