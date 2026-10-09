"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { format } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
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

export function SalesList({ clientId }: Props) {
  const router = useRouter();
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
  const { data, error, loading, reload } = useFetch<{ items: SaleRow[]; total: number }>(`/api/sales?${qs}`);

  const newHref = clientId ? `/sales/new?clientId=${clientId}` : "/sales/new";
  const filtered = Boolean(debounced || status || type);

  const body = (
    <Card variant={clientId ? "elevation" : "outlined"} elevation={0} sx={clientId ? { border: 0 } : undefined}>
      <Box sx={{ p: clientId ? 0 : 2, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Search number, title, client" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 240px", maxWidth: 380 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search sales" } }} />
        <TextField select size="small" label="Status" value={status} onChange={(e) => { setStatus(e.target.value); setPage(0); }} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {SALE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>)}
        </TextField>
        <OptionFilter table="sales" column="type" label="Type" value={type} onChange={(v) => { setType(v); setPage(0); }} minWidth={170} />
        {clientId && <Box sx={{ ml: "auto" }}><Button component={Link} href={newHref} variant="contained" startIcon={<AddIcon />}>Add sale</Button></Box>}
      </Box>
      {error ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <TableSkeleton />
        : data && data.items.length === 0 ? (
          <EmptyState title={filtered ? "No sales match your filters" : "No sales yet"} hint={filtered ? "Try different filters." : "Record a project, license or service sold to a client."}
            action={!filtered ? <Button component={Link} href={newHref} variant="contained">Add sale</Button> : undefined} />
        ) : (
          <>
            <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Sale</TableCell>{!clientId && <TableCell>Client</TableCell>}<TableCell>Type</TableCell><TableCell>Date</TableCell>
                    <TableCell align="right">Order value</TableCell><TableCell align="right">Billed</TableCell><TableCell align="right">Paid</TableCell><TableCell align="right">Balance remaining</TableCell><TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.items.map((s) => (
                    <TableRow key={s.id} hover sx={{ cursor: "pointer" }} onClick={() => router.push(`/sales/${s.id}`)}>
                      <TableCell>
                        <Link href={`/sales/${s.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{s.sale_number}</Link>
                        <Box sx={{ color: "text.secondary", fontSize: 13 }}>{s.title}</Box>
                      </TableCell>
                      {!clientId && <TableCell>{s.client_name}</TableCell>}
                      <TableCell><OptionLabel table="sales" column="type" value={s.type} /></TableCell>
                      <TableCell>{format(new Date(s.sale_date), "dd MMM yyyy")}</TableCell>
                      <TableCell align="right">{formatMoney(s.total, s.currency)}</TableCell>
                      <TableCell align="right">{formatMoney(s.billed_total)}</TableCell>
                      <TableCell align="right">{formatMoney(s.paid_total)}</TableCell>
                      <TableCell align="right">{s.status === "cancelled" ? "—" : formatMoney(s.balance_remaining)}</TableCell>
                      <TableCell>
                        <SaleStatusChip status={s.status} />
                        {s.status === "confirmed" || s.status === "completed" ? (
                          <Box sx={{ mt: 0.5, color: "text.secondary", fontSize: 12 }}>{BILLING_LABEL[s.billing_status]} · {PAYMENT_LABEL[s.payment_status]}</Box>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={data?.total ?? 0} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} />
          </>
        )}
    </Card>
  );

  if (clientId) return body;
  return (
    <>
      <PageHeader title="Sales" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Sales" }]}
        actions={<Button component={Link} href={newHref} variant="contained" startIcon={<AddIcon />}>Add sale</Button>} />
      {body}
    </>
  );
}
