"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import PictureAsPdfIcon from "@mui/icons-material/PictureAsPdfOutlined";
import DownloadIcon from "@mui/icons-material/DownloadOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import { format } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { NewInvoiceDialog } from "./NewInvoiceDialog";
import { ListLayout } from "@/components/common/ListLayout";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { StatCards } from "@/components/common/StatCards";
import type { GridColDef } from "@mui/x-data-grid";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { api } from "@/lib/api-client";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import type { InvoiceRow } from "../service";
import { InvoiceStatusChip } from "./common";

const FILTERS = [
  ["", "All invoices"], ["draft", "Drafts"], ["unpaid", "Unpaid"], ["partial", "Partially paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["cancelled", "Cancelled"],
] as const;

export function InvoicesList({ clientId, saleId, openNew = false, newSaleId, newClientId, saleAction, saleEmptyHint, onChanged }: { onChanged?: () => void; saleAction?: React.ReactNode; saleEmptyHint?: string; clientId?: string; saleId?: string; openNew?: boolean; newSaleId?: string; newClientId?: string }) {
  const [adding, setAdding] = useState(openNew);
  const notify = useNotify();
  const [issuing, setIssuing] = useState<InvoiceRow | null>(null);
  const [issueBusy, setIssueBusy] = useState(false);
  const [issuingAll, setIssuingAll] = useState(false);
  const scoped = Boolean(clientId || saleId);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [filter, setFilter] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
  if (clientId) qs.set("clientId", clientId);
  if (saleId) qs.set("saleId", saleId);
  if (debounced) qs.set("search", debounced);
  if (filter === "draft" || filter === "cancelled") qs.set("status", filter);
  else if (filter) qs.set("paymentStatus", filter);
  const { data, error, loading, reload } = useFetch<{ items: InvoiceRow[]; total: number; totals: { invoiced: string; outstanding: string } }>(`/api/invoices?${qs}`);

  const showNew = Boolean(clientId) && !saleId;
  const filtered = Boolean(debounced || filter);

  const columns: GridColDef<InvoiceRow>[] = [
    {
      field: "invoice_number", headerName: "Invoice", width: 170,
      renderCell: ({ row: i }) => <Link href={`/invoices/${i.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{i.invoice_number ?? "Draft"}</Link>,
    },
    ...(scoped ? [] : [{ field: "client_name", headerName: "Client", minWidth: 160 } as GridColDef<InvoiceRow>]),
    ...(saleId ? [] : [{
      field: "sale_number", headerName: "Sale", width: 110,
      renderCell: ({ row: i }) => <Link href={`/sales/${i.sale_id}`} onClick={(e) => e.stopPropagation()}>{i.sale_number}</Link>,
    } as GridColDef<InvoiceRow>]),
    { field: "issue_date", headerName: "Date", width: 120, valueFormatter: (v: string) => format(new Date(v), "dd MMM yyyy") },
    { field: "due_date", headerName: "Due", width: 120, valueFormatter: (v: string) => format(new Date(v), "dd MMM yyyy") },
    { field: "total", headerName: "Total", width: 120, align: "right", headerAlign: "right", valueFormatter: (v: string) => formatMoney(v) },
    { field: "amount_paid", headerName: "Paid", width: 120, align: "right", headerAlign: "right", valueFormatter: (_v, r) => (r.status === "issued" ? formatMoney(r.amount_paid) : "—") },
    { field: "balance_due", headerName: "Balance", width: 120, align: "right", headerAlign: "right", valueFormatter: (_v, r) => (r.status === "issued" ? formatMoney(r.balance_due) : "—") },
    { field: "status", headerName: "Status", width: 150, renderCell: ({ row: i }) => <InvoiceStatusChip invoice={i} /> },
    {
      field: "actions", headerName: "Actions", width: 170, sortable: false, filterable: false, disableColumnMenu: true,
      renderCell: ({ row: i }) => (
        <>
          {i.status === "draft" && <Button size="small" variant="contained" onClick={(e) => { e.stopPropagation(); setIssuing(i); }}>Issue</Button>}
          <Tooltip title={i.status === "draft" ? "Preview PDF" : "View PDF"}>
            <IconButton size="small" aria-label="View PDF" href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()}><PictureAsPdfIcon fontSize="small" /></IconButton>
          </Tooltip>
          {i.status !== "draft" && (
            <Tooltip title="Download PDF">
              <IconButton size="small" aria-label="Download PDF" href={`/api/invoices/${i.id}/pdf?download=1`} onClick={(e) => e.stopPropagation()}><DownloadIcon fontSize="small" /></IconButton>
            </Tooltip>
          )}
        </>
      ),
    },
  ];

  const drafts = (data?.items ?? []).filter((i) => i.status === "draft");

  /** Issues every draft invoice of this sale, one after another (each gets the next number). */
  async function issueAll() {
    setIssueBusy(true);
    let done = 0;
    try {
      const all = await api<{ items: InvoiceRow[] }>(`/api/invoices?saleId=${saleId}&status=draft&pageSize=100`);
      for (const inv of all.items) {
        await api(`/api/invoices/${inv.id}/issue`, { method: "POST" });
        done++;
      }
      notify.success(`${done} invoice${done === 1 ? "" : "s"} issued`);
    } catch (e) {
      notify.error(`${done ? `${done} issued, then stopped: ` : ""}${e instanceof Error ? e.message : "Could not issue the invoices"}`);
    } finally {
      setIssueBusy(false);
      setIssuingAll(false);
      reload();
      onChanged?.();
    }
  }

  async function issue() {
    if (!issuing) return;
    setIssueBusy(true);
    try {
      const r = await api<{ invoiceNumber: string }>(`/api/invoices/${issuing.id}/issue`, { method: "POST" });
      notify.success(`Invoice ${r.invoiceNumber} issued`);
      reload();
      onChanged?.();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not issue the invoice");
    } finally {
      setIssueBusy(false);
      setIssuing(null);
    }
  }

  const body = (
    <>
      {!scoped && data && data.total > 0 && (
        <StatCards loading={!data} stats={[
          { label: "Invoices in view", value: data.total, hint: "matching the current filters", icon: <ReceiptLongIcon /> },
          { label: "Invoiced", value: formatMoney(data.totals.invoiced), hint: "issued invoices", icon: <PaymentsIcon /> },
          { label: "Outstanding", value: formatMoney(data.totals.outstanding), hint: "invoiced minus payments allocated", icon: <HourglassIcon /> },
        ]} />
      )}
      <ListLayout
        compact={scoped} onRefresh={reload} refreshing={loading}
        search={{ value: search, onChange: setSearch, placeholder: "Search invoice number or client", label: "Search invoices" }}
        tabs={<SegmentedTabs label="Invoice filter" value={filter} onChange={(v) => { setFilter(v); setPage(0); }} tabs={FILTERS.map(([value, label]) => ({ value, label }))} />}
        actions={showNew ? <Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>New invoice</Button> : saleId ? (
          <>
            {drafts.length > 0 && <Button variant="outlined" startIcon={<DoneAllIcon />} onClick={() => setIssuingAll(true)}>Issue all drafts</Button>}
            {saleAction}
          </>
        ) : undefined}
        notice={scoped && data && data.total > 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 1.5 }}>
            Invoiced (issued invoices): <strong>{formatMoney(data.totals.invoiced)}</strong> · Outstanding (invoiced minus payments allocated): <strong>{formatMoney(data.totals.outstanding)}</strong>
          </Typography>
        ) : undefined}
      >
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable<InvoiceRow>
            label="Invoices" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
            page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
            onRowClick={(i) => router.push(`/invoices/${i.id}`)}
            emptyTitle={filtered ? "No invoices match your filters" : "No invoices yet"}
            emptyHint={filtered ? "Try different filters." : saleId ? (saleEmptyHint ?? "Use “Create invoice” to bill this sale.") : "Invoices are raised against a sale."}
            emptyAction={!filtered && !saleId ? <Button onClick={() => setAdding(true)} variant="contained">New invoice</Button> : undefined}
          />
        )}
      </ListLayout>
    </>
  );

  const issueDialog = (
    <ConfirmDialog open={Boolean(issuing)} title="Issue this invoice?" busy={issueBusy} confirmLabel="Issue invoice" onClose={() => setIssuing(null)} onConfirm={issue}
      message="An invoice number will be assigned and the invoice becomes a permanent record: it can no longer be edited or deleted, only cancelled with a reason." />
  );
  const issueAllDialog = (
    <ConfirmDialog open={issuingAll} title="Issue all draft invoices?" busy={issueBusy} confirmLabel="Issue all" onClose={() => setIssuingAll(false)} onConfirm={issueAll}
      message="Every draft invoice of this sale gets its invoice number and becomes a permanent record: it can no longer be edited or deleted, only cancelled with a reason." />
  );
  const dialog = adding ? <NewInvoiceDialog saleId={saleId ?? newSaleId} clientId={clientId ?? newClientId} onClose={() => { setAdding(false); if (openNew) router.replace("/invoices"); }} onCreated={() => { reload(); onChanged?.(); }} /> : null;
  if (scoped) return <>{body}{dialog}{issueDialog}{issueAllDialog}</>;
  return (
    <>
      <PageHeader title="Invoices" subtitle="GST invoices raised against sales" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Invoices" }]}
        actions={<Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>New invoice</Button>} />
      {body}
      {dialog}
      {issueDialog}{issueAllDialog}
    </>
  );
}
