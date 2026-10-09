"use client";
import { selectLoading } from "@/components/common/loading";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import { format } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { LicenseFormDialog } from "./LicenseFormDialog";
import { ListLayout } from "@/components/common/ListLayout";
import { StatCards } from "@/components/common/StatCards";
import VerifiedIcon from "@mui/icons-material/VerifiedOutlined";
import EventIcon from "@mui/icons-material/EventOutlined";
import WarningIcon from "@mui/icons-material/WarningAmberOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import type { GridColDef } from "@mui/x-data-grid";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { LICENSE_STATUSES } from "../schema";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import type { LicenseRow } from "../service";
import type { ProductRow } from "@/features/products/service";
import { DaysRemaining, LicenseStatusChip } from "./common";

const WINDOWS = [["7", "Expiring in 7 days"], ["15", "Expiring in 15 days"], ["30", "Expiring in 30 days"], ["60", "Expiring in 60 days"]] as const;

export function LicensesList({ clientId, openNew = false, newClientId }: { clientId?: string; openNew?: boolean; newClientId?: string }) {
  const [adding, setAdding] = useState(openNew);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [within, setWithin] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const products = useFetch<{ items: ProductRow[] }>("/api/products?pageSize=100");

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), sort: "expiry", dir: "asc" });
  if (clientId) qs.set("clientId", clientId);
  if (debounced) qs.set("search", debounced);
  if (status) qs.set("status", status);
  if (productId) qs.set("productId", productId);
  if (within) qs.set("expiringWithin", within);
  const { data, error, loading, reload } = useFetch<{ items: LicenseRow[]; total: number; renewalValue: string; summary: { active: number; expiring: number; expired: number; pending: number } }>(`/api/licenses?${qs}`);

  const filtered = Boolean(debounced || status || productId || within);
  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { fn(e.target.value); setPage(0); };

  const columns: GridColDef<LicenseRow>[] = [
    {
      field: "license_identifier", headerName: "License", width: 190,
      renderCell: ({ row: l }) => (
        <Box>
          <Link href={`/licenses/${l.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none", fontFamily: "monospace" }}>{l.license_identifier}</Link>
          {l.seat_limit && <Box sx={{ color: "text.secondary", fontSize: 12 }}>{l.seat_limit} seat{l.seat_limit === 1 ? "" : "s"}</Box>}
        </Box>
      ),
    },
    ...(clientId ? [] : [{ field: "client_name", headerName: "Client", minWidth: 160 } as GridColDef<LicenseRow>]),
    {
      field: "product_name", headerName: "Product / plan", minWidth: 180,
      renderCell: ({ row: l }) => <Box>{l.product_name}<Box sx={{ color: "text.secondary", fontSize: 13 }}><OptionLabel table="licenses" column="plan" value={l.plan} /></Box></Box>,
    },
    { field: "expiry_date", headerName: "Expiry", width: 120, valueFormatter: (v: string) => format(new Date(v), "dd MMM yyyy") },
    { field: "days_remaining", headerName: "Days left", width: 130, renderCell: ({ row: l }) => <DaysRemaining expiry={l.expiry_date} status={l.status} /> },
    { field: "renewal_price", headerName: "Renewal price", width: 130, align: "right", headerAlign: "right", valueFormatter: (v: string | null) => formatMoney(v) },
    { field: "status", headerName: "Status", width: 120, renderCell: ({ row: l }) => <LicenseStatusChip status={l.status} /> },
  ];

  const body = (
    <>
    {!clientId && (
      <StatCards loading={!data} stats={[
        { label: "Active licenses", value: data?.summary.active ?? 0, icon: <VerifiedIcon />, selected: status === "active" && within === "", onClick: () => { setStatus("active"); setWithin(""); setPage(0); } },
        { label: "Expiring in 30 days", value: data?.summary.expiring ?? 0, hint: "renewal opportunities", icon: <EventIcon />, selected: within === "30", onClick: () => { setStatus(""); setWithin("30"); setPage(0); } },
        { label: "Expired", value: data?.summary.expired ?? 0, hint: "active past expiry", icon: <WarningIcon />, selected: status === "expired", onClick: () => { setStatus("expired"); setWithin(""); setPage(0); } },
        { label: "Pending activation", value: data?.summary.pending ?? 0, icon: <HourglassIcon />, selected: status === "pending", onClick: () => { setStatus("pending"); setWithin(""); setPage(0); } },
      ]} />
    )}
    <ListLayout
      compact={Boolean(clientId)} onRefresh={reload} refreshing={loading}
      search={{ value: search, onChange: setSearch, placeholder: "Search identifier, client, product, plan", label: "Search licenses" }}
      filters={<>
        <TextField select size="small" label="Product" value={productId} onChange={reset(setProductId)} sx={{ minWidth: 180 }} slotProps={selectLoading(products.loading)}>
          <MenuItem value="">All products</MenuItem>
          {products.data?.items.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Expiry" value={within} onChange={reset(setWithin)} sx={{ minWidth: 190 }}>
          <MenuItem value="">Any time</MenuItem>
          <MenuItem value="0">Expired or expiring today</MenuItem>
          {WINDOWS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
      </>}
      tabs={<SegmentedTabs label="License status" value={status} onChange={(v) => { setStatus(v); setPage(0); }}
        tabs={[{ value: "", label: "All" }, ...LICENSE_STATUSES.map((s) => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))]} />}
      actions={clientId ? <Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>Issue license</Button> : undefined}
      notice={within !== "" && data && data.total > 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ px: 2.5, pb: 1.5 }}>
          Projected renewal value for these {data.total} license{data.total === 1 ? "" : "s"}: <strong>{formatMoney(data.renewalValue)}</strong>
          {" "}(sum of renewal prices; not invoiced or collected, and excludes licenses without a renewal price).
        </Typography>
      ) : undefined}
    >
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <DataTable<LicenseRow>
          label="Licenses" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
          page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
          onRowClick={(l) => router.push(`/licenses/${l.id}`)}
          emptyTitle={filtered ? "No licenses match your filters" : "No licenses yet"}
          emptyHint={filtered ? "Try different filters." : "Issue a license to a client to start the register."}
          emptyAction={!filtered ? <Button onClick={() => setAdding(true)} variant="contained">Issue license</Button> : undefined}
        />
      )}
    </ListLayout>
    </>
  );

  const dialog = adding ? <LicenseFormDialog clientId={clientId ?? newClientId} onClose={() => { setAdding(false); if (openNew) router.replace(clientId ? `/clients/${clientId}` : "/licenses"); }} onSaved={() => { setAdding(false); reload(); if (openNew) router.replace(clientId ? `/clients/${clientId}` : "/licenses"); }} /> : null;
  if (clientId) return <>{body}{dialog}</>;
  return (
    <>
      <PageHeader title="Software Licenses" subtitle="Issued licenses, renewals and expiry tracking" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Software Licenses" }]}
        actions={<Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>Issue license</Button>} />
      {body}
      {dialog}
    </>
  );
}
