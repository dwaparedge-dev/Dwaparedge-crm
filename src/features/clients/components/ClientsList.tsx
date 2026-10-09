"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import type { ClientRow } from "../service";

type SortKey = "name" | "created" | "status";
interface ListResponse {
  items: ClientRow[];
  total: number;
}

export function StatusChip({ status, archived }: { status: string; archived?: boolean }) {
  if (archived) return <Chip size="small" label="Archived" />;
  return <Chip size="small" label={status === "active" ? "Active" : "Inactive"} color={status === "active" ? "success" : "default"} variant="outlined" />;
}

export function ClientsList() {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [archived, setArchived] = useState("false");
  const [sort, setSort] = useState<SortKey>("name");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebounced(search.trim());
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), sort, dir, archived });
  if (debounced) qs.set("search", debounced);
  if (status) qs.set("status", status);
  const { data, error, loading, reload } = useFetch<ListResponse>(`/api/clients?${qs}`);

  const toggleSort = (key: SortKey) => {
    setDir(sort === key && dir === "asc" ? "desc" : "asc");
    setSort(key);
    setPage(0);
  };

  return (
    <>
      <PageHeader
        title="Clients"
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Clients" }]}
        actions={
          <Button component={Link} href="/clients/new" variant="contained" startIcon={<AddIcon />}>
            Add client
          </Button>
        }
      />
      <Card>
        <Box sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField
            size="small"
            placeholder="Search name, GSTIN, email, phone, city"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            sx={{ flex: "1 1 260px", maxWidth: 420 }}
            slotProps={{
              input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> },
              htmlInput: { "aria-label": "Search clients" },
            }}
          />
          <TextField select size="small" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="active">Active</MenuItem>
            <MenuItem value="inactive">Inactive</MenuItem>
          </TextField>
          <TextField select size="small" label="Show" value={archived} onChange={(e) => { setArchived(e.target.value); setPage(0); }} sx={{ minWidth: 140 }}>
            <MenuItem value="false">Current</MenuItem>
            <MenuItem value="true">Archived</MenuItem>
          </TextField>
        </Box>

        {error ? (
          <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box>
        ) : loading && !data ? (
          <TableSkeleton />
        ) : data && data.items.length === 0 ? (
          <EmptyState
            title={debounced || status ? "No clients match your filters" : archived === "true" ? "No archived clients" : "No clients yet"}
            hint={debounced || status ? "Try a different search or clear the filters." : "Add your first client to get started."}
            action={!debounced && !status && archived === "false" ? <Button component={Link} href="/clients/new" variant="contained">Add client</Button> : undefined}
          />
        ) : (
          <>
            <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
              <Table size="medium">
                <TableHead>
                  <TableRow>
                    <TableCell sortDirection={sort === "name" ? dir : false}>
                      <TableSortLabel active={sort === "name"} direction={dir} onClick={() => toggleSort("name")}>Client</TableSortLabel>
                    </TableCell>
                    <TableCell>GSTIN</TableCell>
                    <TableCell>Contact</TableCell>
                    <TableCell>Owner</TableCell>
                    <TableCell sortDirection={sort === "status" ? dir : false}>
                      <TableSortLabel active={sort === "status"} direction={dir} onClick={() => toggleSort("status")}>Status</TableSortLabel>
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.items.map((c) => (
                    <TableRow key={c.id} hover sx={{ cursor: "pointer" }} onClick={() => router.push(`/clients/${c.id}`)}>
                      <TableCell>
                        <Link href={`/clients/${c.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>
                          {c.display_name}
                        </Link>
                        {c.legal_name !== c.display_name && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{c.legal_name}</Box>}
                      </TableCell>
                      <TableCell>{c.gstin ?? "—"}</TableCell>
                      <TableCell>
                        {c.email ?? "—"}
                        {c.phone && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{c.phone}</Box>}
                      </TableCell>
                      <TableCell>{c.owner_name ?? "—"}</TableCell>
                      <TableCell><StatusChip status={c.status} archived={c.archived_at !== null} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={data?.total ?? 0}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }}
            />
          </>
        )}
      </Card>
    </>
  );
}
