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
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { format } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import type { InvoiceRow } from "../service";
import { InvoiceStatusChip } from "./common";

const FILTERS = [
  ["", "All invoices"], ["draft", "Drafts"], ["unpaid", "Unpaid"], ["partial", "Partially paid"], ["overdue", "Overdue"], ["paid", "Paid"], ["cancelled", "Cancelled"],
] as const;

export function InvoicesList({ clientId, saleId }: { clientId?: string; saleId?: string }) {
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

  const newHref = clientId ? `/invoices/new?clientId=${clientId}` : "/invoices/new";
  const showNew = Boolean(clientId) && !saleId;
  const filtered = Boolean(debounced || filter);

  const body = (
    <Card variant={scoped ? "elevation" : "outlined"} elevation={0} sx={scoped ? { border: 0 } : undefined}>
      <Box sx={{ p: scoped ? 0 : 2, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Search invoice number or client" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 240px", maxWidth: 380 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search invoices" } }} />
        <TextField select size="small" label="Show" value={filter} onChange={(e) => { setFilter(e.target.value); setPage(0); }} sx={{ minWidth: 170 }}>
          {FILTERS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        {showNew && <Box sx={{ ml: "auto" }}><Button component={Link} href={newHref} variant="contained" startIcon={<AddIcon />}>New invoice</Button></Box>}
      </Box>
      {data && data.total > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: scoped ? 0 : 2, pb: 1.5 }}>
          Invoiced (issued invoices): <strong>{formatMoney(data.totals.invoiced)}</strong> · Outstanding (invoiced minus payments allocated): <strong>{formatMoney(data.totals.outstanding)}</strong>
        </Typography>
      )}
      {error ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <TableSkeleton />
        : data && data.items.length === 0 ? (
          <EmptyState title={filtered ? "No invoices match your filters" : "No invoices yet"} hint={filtered ? "Try different filters." : saleId ? "Use “Create invoice” above to bill this sale." : "Invoices are raised against a sale."}
            action={!filtered && !saleId ? <Button component={Link} href={newHref} variant="contained">New invoice</Button> : undefined} />
        ) : (
          <>
            <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Invoice</TableCell>{!scoped && <TableCell>Client</TableCell>}{!saleId && <TableCell>Sale</TableCell>}<TableCell>Date</TableCell><TableCell>Due</TableCell>
                    <TableCell align="right">Total</TableCell><TableCell align="right">Paid</TableCell><TableCell align="right">Balance</TableCell><TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.items.map((i) => (
                    <TableRow key={i.id} hover sx={{ cursor: "pointer" }} onClick={() => router.push(`/invoices/${i.id}`)}>
                      <TableCell>
                        <Link href={`/invoices/${i.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{i.invoice_number ?? "Draft"}</Link>
                      </TableCell>
                      {!scoped && <TableCell>{i.client_name}</TableCell>}
                      {!saleId && <TableCell><Link href={`/sales/${i.sale_id}`} onClick={(e) => e.stopPropagation()}>{i.sale_number}</Link></TableCell>}
                      <TableCell>{format(new Date(i.issue_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{format(new Date(i.due_date), "dd MMM yyyy")}</TableCell>
                      <TableCell align="right">{formatMoney(i.total)}</TableCell>
                      <TableCell align="right">{i.status === "issued" ? formatMoney(i.amount_paid) : "—"}</TableCell>
                      <TableCell align="right">{i.status === "issued" ? formatMoney(i.balance_due) : "—"}</TableCell>
                      <TableCell><InvoiceStatusChip invoice={i} /></TableCell>
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

  if (scoped) return body;
  return (
    <>
      <PageHeader title="Invoices" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Invoices" }]}
        actions={<Button component={Link} href={newHref} variant="contained" startIcon={<AddIcon />}>New invoice</Button>} />
      {body}
    </>
  );
}
