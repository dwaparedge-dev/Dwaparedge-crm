"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { ListLayout } from "@/components/common/ListLayout";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { StatCards } from "@/components/common/StatCards";
import type { GridColDef } from "@mui/x-data-grid";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import SavingsIcon from "@mui/icons-material/SavingsOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { OptionFilter, OptionLabel } from "@/features/options/components/OptionSelect";
import type { PaymentRow } from "../service";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

export function PaymentsList({ clientId, saleId, saleNumber, suggestedAmount, onChanged }: { clientId?: string; saleId?: string; saleNumber?: string; suggestedAmount?: string; onChanged?: () => void }) {
  const scoped = Boolean(clientId || saleId);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [method, setMethod] = useState("");
  const [voided, setVoided] = useState(false);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), includeVoided: String(voided) });
  if (clientId && !saleId) qs.set("clientId", clientId);
  if (saleId) qs.set("saleId", saleId);
  if (debounced) qs.set("search", debounced);
  if (method) qs.set("method", method);
  const { data, error, loading, reload } = useFetch<{ items: PaymentRow[]; total: number; totals: { collected: string; unallocated: string } }>(`/api/payments?${qs}`);
  const filtered = Boolean(debounced || method);

  const columns: GridColDef<PaymentRow>[] = [
    {
      field: "receipt_number", headerName: "Receipt", minWidth: 190,
      renderCell: ({ row: p }) => (
        <Box sx={{ minWidth: 0, opacity: p.voided_at ? 0.55 : 1 }}>
          <Link href={`/payments/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{p.receipt_number}</Link>
          {p.voided_at && <Chip size="small" label="Voided" sx={{ ml: 1 }} />}
          {p.reference && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{p.reference}</Box>}
        </Box>
      ),
    },
    ...(scoped ? [] : [{ field: "client_name", headerName: "Client", minWidth: 160 } as GridColDef<PaymentRow>]),
    { field: "payment_date", headerName: "Date", width: 120, valueFormatter: (v: string) => format(parseISO(v), "dd MMM yyyy") },
    { field: "method", headerName: "Method", width: 140, renderCell: ({ row: p }) => <OptionLabel table="payments" column="method" value={p.method} /> },
    { field: "amount", headerName: "Amount", width: 130, align: "right", headerAlign: "right", valueFormatter: (v: string) => formatMoney(v) },
    ...(saleId ? [{ field: "applied_to_sale", headerName: "Applied to this sale", width: 160, align: "right", headerAlign: "right", valueFormatter: (v: string | null) => formatMoney(v ?? "0") } as GridColDef<PaymentRow>] : []),
    { field: "unallocated", headerName: "Unallocated", width: 130, align: "right", headerAlign: "right", valueFormatter: (_v, r) => (r.voided_at ? "—" : formatMoney(r.unallocated)) },
  ];

  const body = (
    <>
      {!scoped && data && data.total > 0 && (
        <StatCards stats={[
          { label: "Payments in view", value: data.total, hint: "matching the current filters", icon: <PaymentsIcon /> },
          { label: "Collected", value: formatMoney(data.totals.collected), hint: "received, not voided", icon: <SavingsIcon /> },
          { label: "Advances", value: formatMoney(data.totals.unallocated), hint: "not yet allocated to invoices", icon: <HourglassIcon /> },
        ]} />
      )}
      <ListLayout
        compact={scoped} onRefresh={reload} refreshing={loading}
        search={{ value: search, onChange: setSearch, placeholder: "Search receipt, reference or client", label: "Search payments" }}
        filters={<OptionFilter table="payments" column="method" label="Method" value={method} onChange={(v) => { setMethod(v); setPage(0); }} />}
        tabs={<SegmentedTabs label="Voided payments" value={String(voided)} onChange={(v) => { setVoided(v === "true"); setPage(0); }} tabs={[{ value: "false", label: "Active" }, { value: "true", label: "Include voided" }]} />}
        actions={scoped ? <Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecording(true)}>Record payment</Button> : undefined}
        notice={scoped && data && data.total > 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 1.5 }}>
            Collected (payments received, not voided): <strong>{formatMoney(data.totals.collected)}</strong> · Not yet allocated to invoices (advances): <strong>{formatMoney(data.totals.unallocated)}</strong>
          </Typography>
        ) : undefined}
      >
        {error ? <ErrorState message={error} onRetry={reload} /> : (
          <DataTable<PaymentRow>
            label="Payments" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
            page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
            onRowClick={(p) => router.push(`/payments/${p.id}`)}
            emptyTitle={filtered ? "No payments match your filters" : "No payments yet"}
            emptyHint={filtered ? "Try different filters." : "Record a payment when money is received from a client."}
            emptyAction={!filtered ? <Button variant="contained" onClick={() => setRecording(true)}>Record payment</Button> : undefined}
          />
        )}
      </ListLayout>
      {recording && <RecordPaymentDialog clientId={clientId} saleId={saleId} saleNumber={saleNumber} suggestedAmount={suggestedAmount} onClose={() => setRecording(false)} onSaved={(id) => { setRecording(false); if (saleId) { reload(); onChanged?.(); } else router.push(`/payments/${id}`); }} />}
    </>
  );

  if (scoped) return body;
  return (
    <>
      <PageHeader title="Payments" subtitle="Money received, allocations to invoices and advances" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Payments" }]}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecording(true)}>Record payment</Button>} />
      {body}
    </>
  );
}
