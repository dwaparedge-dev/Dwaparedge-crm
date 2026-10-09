"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import AddIcon from "@mui/icons-material/Add";
import type { GridColDef } from "@mui/x-data-grid";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { ListLayout } from "@/components/common/ListLayout";
import { ClientFormDialog } from "./ClientFormDialog";
import { StatCards } from "@/components/common/StatCards";
import BusinessIcon from "@mui/icons-material/BusinessOutlined";
import HandshakeIcon from "@mui/icons-material/HandshakeOutlined";
import PersonAddIcon from "@mui/icons-material/PersonAddAltOutlined";
import ArchiveIcon from "@mui/icons-material/ArchiveOutlined";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { useFetch } from "@/components/common/useFetch";
import type { ClientRow } from "../service";

interface ListResponse {
  items: ClientRow[];
  total: number;
  summary: { current: number; archived: number; newThisMonth: number; withSales: number };
}

export function StatusChip({ archived }: { archived?: boolean }) {
  return archived ? <Chip size="small" label="Archived" /> : <Chip size="small" label="Active" color="success" variant="outlined" />;
}

export function ClientsList({ openNew = false }: { openNew?: boolean }) {
  const router = useRouter();
  const [adding, setAdding] = useState(openNew);
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [archived, setArchived] = useState("false");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), sort: "name", dir: "asc", archived });
  if (debounced) qs.set("search", debounced);
  const { data, error, loading, reload } = useFetch<ListResponse>(`/api/clients?${qs}`);

  const columns: GridColDef<ClientRow>[] = [
    {
      field: "display_name", headerName: "Client", minWidth: 220,
      renderCell: ({ row: c }) => (
        <Box sx={{ minWidth: 0 }}>
          <Link href={`/clients/${c.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{c.display_name}</Link>
          {c.legal_name !== c.display_name && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{c.legal_name}</Box>}
        </Box>
      ),
    },
    { field: "gstin", headerName: "GSTIN", width: 170, valueFormatter: (v: string | null) => v ?? "—" },
    {
      field: "email", headerName: "Contact", minWidth: 200,
      renderCell: ({ row: c }) => (
        <Box sx={{ minWidth: 0 }}>
          {c.email ?? "—"}
          {c.phone && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{c.phone}</Box>}
        </Box>
      ),
    },
    { field: "owner_name", headerName: "Owner", width: 150, valueFormatter: (v: string | null) => v ?? "—" },
    { field: "archived_at", headerName: "Status", width: 110, renderCell: ({ row: c }) => <StatusChip archived={c.archived_at !== null} /> },
  ];

  return (
    <>
      <PageHeader
        title="Clients" subtitle="Companies you work with, their contacts and history"
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Clients" }]}
        actions={<Button onClick={() => setAdding(true)} variant="contained" startIcon={<AddIcon />}>Add client</Button>}
      />
      <StatCards loading={!data} stats={[
        { label: "Clients", value: data?.summary.current ?? 0, hint: "current", icon: <BusinessIcon />, onClick: () => { setArchived("false"); setPage(0); } },
        { label: "With active sales", value: data?.summary.withSales ?? 0, hint: "confirmed or completed", icon: <HandshakeIcon /> },
        { label: "New this month", value: data?.summary.newThisMonth ?? 0, hint: "added since the 1st", icon: <PersonAddIcon /> },
        { label: "Archived", value: data?.summary.archived ?? 0, hint: "kept for history", icon: <ArchiveIcon />, selected: archived === "true", onClick: () => { setArchived("true"); setPage(0); } },
      ]} />
      <ListLayout
        onRefresh={reload} refreshing={loading}
        search={{ value: search, onChange: setSearch, placeholder: "Search name, GSTIN, email, phone, city", label: "Search clients" }}
        tabs={<SegmentedTabs label="Client list" value={archived} onChange={(v) => { setArchived(v); setPage(0); }} tabs={[{ value: "false", label: "Current" }, { value: "true", label: "Archived" }]} />}
      >
        {error ? <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box> : (
          <DataTable<ClientRow>
            label="Clients" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
            page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
            onRowClick={(c) => router.push(`/clients/${c.id}`)}
            emptyTitle={debounced ? "No clients match your filters" : archived === "true" ? "No archived clients" : "No clients yet"}
            emptyHint={debounced ? "Try a different search or clear the filters." : "Add your first client to get started."}
            emptyAction={!debounced && archived === "false" ? <Button onClick={() => setAdding(true)} variant="contained">Add client</Button> : undefined}
          />
        )}
      </ListLayout>
      {adding && <ClientFormDialog onClose={() => { setAdding(false); if (openNew) router.replace("/clients"); }} onSaved={() => { setAdding(false); reload(); if (openNew) router.replace("/clients"); }} />}
    </>
  );
}
