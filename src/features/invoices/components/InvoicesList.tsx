"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
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
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import type { InvoiceRow } from "../service";
import { InvoiceStatusChip } from "./common";

const FILTERS = [
  ["", "All invoices"], ["draft", "Drafts"], ["unpaid", "Unpaid"], ["partial", "Partially paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["cancelled", "Cancelled"],
] as const;

export function InvoicesList({ clientId, saleId, openNew = false, newSaleId, newClientId }: { clientId?: string; saleId?: string; openNew?: boolean; newSaleId?: string; newClientId?: string }) {
  const [adding, setAdding] = useState(openNew);
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
  ];

  const body = (
    <>
      {!scoped && data && data.total > 0 && (
        <StatCards stats={[
          { label: "Invoices in view", value: data.total, hint: "matching the current filters", icon: <ReceiptLongIcon /> },
          { label: "Invoiced", value: formatMoney(data.totals.invoiced), hint: "issued invoices", icon: <PaymentsIcon /> },
          { label: "Outstanding", value: formatMoney(data.totals.outstanding), hint: "invoiced minus payments allocated", icon: <HourglassIcon /> },
        ]} />
      )}
      <ListLayout
        compact={scoped} onRefresh={reload} refreshing={loading}
        search={{ value: search, onChange: setSearch, placeholder: "Search invoice number or client", label: "Search invoices" }}
        tabs={<SegmentedTabs label="Invoice filter" value={filter} onChange={(v) => { setFilter(v); setPage(0); }} tabs={FILTERS.map(([value, label]) => ({ value, label }))} />}
        actions={showNew ? <Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>New invoice</Button> : undefined}
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
            emptyHint={filtered ? "Try different filters." : saleId ? "Use “Create invoice” above to bill this sale." : "Invoices are raised against a sale."}
            emptyAction={!filtered && !saleId ? <Button onClick={() => setAdding(true)} variant="contained">New invoice</Button> : undefined}
          />
        )}
      </ListLayout>
    </>
  );

  const dialog = adding ? <NewInvoiceDialog saleId={saleId ?? newSaleId} clientId={clientId ?? newClientId} onClose={() => { setAdding(false); if (openNew) router.replace("/invoices"); }} /> : null;
  if (scoped) return <>{body}{dialog}</>;
  return (
    <>
      <PageHeader title="Invoices" subtitle="GST invoices raised against sales" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Invoices" }]}
        actions={<Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>New invoice</Button>} />
      {body}
      {dialog}
    </>
  );
}
