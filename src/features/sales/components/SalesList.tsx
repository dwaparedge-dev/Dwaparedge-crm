"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import AddIcon from "@mui/icons-material/Add";
import { format } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { SaleFormDialog } from "./SaleFormDialog";
import { ListLayout } from "@/components/common/ListLayout";
import { StatCards } from "@/components/common/StatCards";
import HandshakeIcon from "@mui/icons-material/HandshakeOutlined";
import ReceiptLongIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import type { GridColDef } from "@mui/x-data-grid";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { SALE_STATUSES } from "../schema";
import { OptionFilter, OptionLabel } from "@/features/options/components/OptionSelect";
import type { SaleRow } from "../service";
import { BILLING_LABEL, PAYMENT_LABEL, SaleStatusChip } from "./common";

interface Props {
  /** When set, the list is scoped to one client and rendered without page chrome. */
  clientId?: string;
}

export function SalesList({ clientId, openNew = false, newClientId }: Props & { openNew?: boolean; newClientId?: string }) {
  const router = useRouter();
  const [adding, setAdding] = useState(openNew);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [type, setType] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
  if (clientId) qs.set("clientId", clientId);
  if (debounced) qs.set("search", debounced);
  if (status) qs.set("status", status);
  if (type) qs.set("type", type);
  const { data, error, loading, reload } = useFetch<{ items: SaleRow[]; total: number; summary: { orderValue: string; billed: string; paid: string; balance: string; statusCounts: Record<string, number> } }>(`/api/sales?${qs}`);

  const filtered = Boolean(debounced || status || type);

  const columns: GridColDef<SaleRow>[] = [
    {
      field: "sale_number", headerName: "Sale", minWidth: 190,
      renderCell: ({ row: s }) => (
        <Box sx={{ minWidth: 0 }}>
          <Link href={`/sales/${s.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{s.sale_number}</Link>
          <Box sx={{ color: "text.secondary", fontSize: 13 }}>{s.title}</Box>
        </Box>
      ),
    },
    ...(clientId ? [] : [{ field: "client_name", headerName: "Client", minWidth: 160 } as GridColDef<SaleRow>]),
    { field: "type", headerName: "Type", width: 130, renderCell: ({ row: s }) => <OptionLabel table="sales" column="type" value={s.type} /> },
    { field: "sale_date", headerName: "Date", width: 120, valueFormatter: (v: string) => format(new Date(v), "dd MMM yyyy") },
    { field: "total", headerName: "Order value", width: 130, align: "right", headerAlign: "right", valueFormatter: (_v, r) => formatMoney(r.total, r.currency) },
    { field: "billed_total", headerName: "Billed", width: 120, align: "right", headerAlign: "right", valueFormatter: (v: string) => formatMoney(v) },
    { field: "paid_total", headerName: "Paid", width: 120, align: "right", headerAlign: "right", valueFormatter: (v: string) => formatMoney(v) },
    { field: "balance_remaining", headerName: "Balance", width: 130, align: "right", headerAlign: "right", valueFormatter: (_v, r) => (r.status === "cancelled" ? "—" : formatMoney(r.balance_remaining)) },
    {
      field: "status", headerName: "Status", width: 170,
      renderCell: ({ row: s }) => (
        <Box>
          <SaleStatusChip status={s.status} />
          {s.status === "confirmed" || s.status === "completed" ? (
            <Box sx={{ mt: 0.5, color: "text.secondary", fontSize: 12 }}>{BILLING_LABEL[s.billing_status]} · {PAYMENT_LABEL[s.payment_status]}</Box>
          ) : null}
        </Box>
      ),
    },
  ];

  const counts = data?.summary.statusCounts ?? {};
  const allCount = Object.values(counts).reduce((a, b) => a + b, 0);
  const body = (
    <>
    {!clientId && (
      <StatCards loading={!data} stats={[
        { label: "Order value", value: formatMoney(data?.summary.orderValue), hint: `${data?.total ?? 0} sale${data?.total === 1 ? "" : "s"} in view`, icon: <HandshakeIcon /> },
        { label: "Billed", value: formatMoney(data?.summary.billed), hint: "on issued invoices", icon: <ReceiptLongIcon /> },
        { label: "Paid", value: formatMoney(data?.summary.paid), hint: "received incl. advances", icon: <PaymentsIcon /> },
        { label: "Balance remaining", value: formatMoney(data?.summary.balance), hint: "still to be received", icon: <HourglassIcon /> },
      ]} />
    )}
    <ListLayout
      compact={Boolean(clientId)} onRefresh={reload} refreshing={loading}
      search={{ value: search, onChange: setSearch, placeholder: "Search number, title, client", label: "Search sales" }}
      filters={<OptionFilter table="sales" column="type" label="Type" value={type} onChange={(v) => { setType(v); setPage(0); }} minWidth={170} />}
      tabs={<SegmentedTabs label="Sale status" value={status} onChange={(v) => { setStatus(v); setPage(0); }}
        tabs={[{ value: "", label: "All", count: allCount }, ...SALE_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), count: counts[s] ?? 0 }))]} />}
      actions={clientId ? <Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>Add sale</Button> : undefined}
    >
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable<SaleRow>
          label="Sales" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
          page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
          onRowClick={(s) => router.push(`/sales/${s.id}`)}
          emptyTitle={filtered ? "No sales match your filters" : "No sales yet"}
          emptyHint={filtered ? "Try different filters." : "Record a project, license or service sold to a client."}
          emptyAction={!filtered ? <Button onClick={() => setAdding(true)} variant="contained">Add sale</Button> : undefined}
        />
      )}
    </ListLayout>
    </>
  );

  const dialog = adding ? <SaleFormDialog clientId={clientId ?? newClientId} onClose={() => { setAdding(false); if (openNew) router.replace(clientId ? `/clients/${clientId}` : "/sales"); }} onSaved={() => { setAdding(false); reload(); if (openNew) router.replace(clientId ? `/clients/${clientId}` : "/sales"); }} /> : null;
  if (clientId) return <>{body}{dialog}</>;
  return (
    <>
      <PageHeader title="Sales" subtitle="Projects, licenses and services sold, with billing and payment progress" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Sales" }]}
        actions={<Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>Add sale</Button>} />
      {body}
      {dialog}
    </>
  );
}
