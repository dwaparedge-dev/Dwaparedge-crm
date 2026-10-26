"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import MarkEmailUnreadIcon from "@mui/icons-material/MarkEmailUnreadOutlined";
import PhoneCallbackIcon from "@mui/icons-material/PhoneCallbackOutlined";
import EventIcon from "@mui/icons-material/EventAvailableOutlined";
import DoneAllIcon from "@mui/icons-material/DoneAll";
import type { GridColDef } from "@mui/x-data-grid";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { ListLayout } from "@/components/common/ListLayout";
import { StatCards } from "@/components/common/StatCards";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { useFetch } from "@/components/common/useFetch";
import type { DemoRequestRow } from "../service";
import type { DemoRequestStatus } from "../schema";
import { DemoRequestStatusChip, STATUS_LABEL, asStatus, describeSource, formatMobile } from "./common";

interface Summary { new: number; contacted: number; scheduled: number; done: number; spam: number; all: number }
interface ListResponse { items: DemoRequestRow[]; total: number; summary: Summary }

const when = (v: string) => format(new Date(v), "dd MMM yyyy, hh:mm a");

export function DemoRequestsList({ initialStatus = "" }: { initialStatus?: string }) {
  const router = useRouter();
  const [status, setStatus] = useState<DemoRequestStatus | "">(asStatus(initialStatus));
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), sort: "created", dir: "desc" });
  if (status) qs.set("status", status);
  if (debounced) qs.set("search", debounced);
  const { data, error, loading, reload } = useFetch<ListResponse>(`/api/demo-requests?${qs}`);
  const pick = (s: DemoRequestStatus | "") => { setStatus(s); setPage(0); };

  const columns: GridColDef<DemoRequestRow>[] = [
    { field: "created_at", headerName: "Received", width: 180, valueFormatter: when },
    {
      field: "name", headerName: "Name", minWidth: 190,
      renderCell: ({ row: r }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Box component="span" sx={{ fontWeight: r.status === "new" ? 700 : 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</Box>
          {r.repeat_count > 0 && <Chip size="small" variant="outlined" label={`asked again${r.repeat_count > 1 ? ` ×${r.repeat_count}` : ""}`} />}
        </Box>
      ),
    },
    { field: "company", headerName: "Company", minWidth: 190 },
    { field: "mobile", headerName: "Mobile", width: 160, valueFormatter: formatMobile },
    { field: "email", headerName: "Email", minWidth: 220 },
    { field: "entry_point", headerName: "Came from", minWidth: 230, valueGetter: (_v, r) => describeSource(r.source, r.entry_point) },
    { field: "owner_name", headerName: "Owner", width: 150, valueFormatter: (v: string | null) => v ?? "Unassigned" },
    { field: "status", headerName: "Status", width: 130, renderCell: ({ row: r }) => <DemoRequestStatusChip status={r.status} /> },
  ];

  const count = (key: keyof Summary) => data?.summary[key];
  const filtered = Boolean(debounced);

  return (
    <>
      <PageHeader title="Demo Requests" subtitle="People who booked a demo on the FactoOne website: call them, track the follow-up" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Demo Requests" }]} />
      <StatCards loading={!data} stats={[
        { label: "New", value: count("new") ?? 0, hint: "waiting for a first call", icon: <MarkEmailUnreadIcon />, selected: status === "new", onClick: () => pick("new") },
        { label: "Contacted", value: count("contacted") ?? 0, hint: "reached out, no date yet", icon: <PhoneCallbackIcon />, selected: status === "contacted", onClick: () => pick("contacted") },
        { label: "Scheduled", value: count("scheduled") ?? 0, hint: "demo date agreed", icon: <EventIcon />, selected: status === "scheduled", onClick: () => pick("scheduled") },
        { label: "Done", value: count("done") ?? 0, hint: "demo given", icon: <DoneAllIcon />, selected: status === "done", onClick: () => pick("done") },
      ]} />
      <ListLayout
        onRefresh={reload} refreshing={loading}
        search={{ value: search, onChange: setSearch, placeholder: "Search name, company, mobile, email", label: "Search demo requests" }}
        tabs={<SegmentedTabs label="Demo request status" value={status} onChange={(v) => pick(asStatus(v))}
          tabs={[{ value: "", label: "All", count: count("all") }, ...(["new", "contacted", "scheduled", "done", "spam"] as const).map((s) => ({ value: s, label: STATUS_LABEL[s], count: count(s) }))]} />}
      >
        {error ? <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box> : (
          <DataTable<DemoRequestRow>
            label="Demo requests" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
            page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
            onRowClick={(r) => router.push(`/demo-requests/${r.id}`)}
            emptyTitle={filtered ? "No demo requests match your search" : status === "spam" ? "No spam" : status ? `No ${STATUS_LABEL[status].toLowerCase()} requests` : "No demo requests yet"}
            emptyHint={filtered ? "Try a different search." : status ? "Requests move here as you work through them." : "They appear here as soon as someone books a demo on the FactoOne website."}
          />
        )}
      </ListLayout>
    </>
  );
}
