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
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { format, parseISO } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "../schema";
import type { PaymentRow } from "../service";
import { RecordPaymentDialog } from "./RecordPaymentDialog";

export function PaymentsList({ clientId }: { clientId?: string }) {
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
  if (clientId) qs.set("clientId", clientId);
  if (debounced) qs.set("search", debounced);
  if (method) qs.set("method", method);
  const { data, error, loading, reload } = useFetch<{ items: PaymentRow[]; total: number; totals: { collected: string; unallocated: string } }>(`/api/payments?${qs}`);
  const filtered = Boolean(debounced || method);

  const body = (
    <Card variant={clientId ? "elevation" : "outlined"} elevation={0} sx={clientId ? { border: 0 } : undefined}>
      <Box sx={{ p: clientId ? 0 : 2, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Search receipt, reference or client" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 240px", maxWidth: 380 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search payments" } }} />
        <TextField select size="small" label="Method" value={method} onChange={(e) => { setMethod(e.target.value); setPage(0); }} sx={{ minWidth: 160 }}>
          <MenuItem value="">All methods</MenuItem>
          {PAYMENT_METHODS.map((m) => <MenuItem key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Voided" value={String(voided)} onChange={(e) => { setVoided(e.target.value === "true"); setPage(0); }} sx={{ minWidth: 150 }}>
          <MenuItem value="false">Hide voided</MenuItem>
          <MenuItem value="true">Include voided</MenuItem>
        </TextField>
        {clientId && <Box sx={{ ml: "auto" }}><Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecording(true)}>Record payment</Button></Box>}
      </Box>
      {data && data.total > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: clientId ? 0 : 2, pb: 1.5 }}>
          Collected (payments received, not voided): <strong>{formatMoney(data.totals.collected)}</strong> · Not yet allocated to invoices (advances): <strong>{formatMoney(data.totals.unallocated)}</strong>
        </Typography>
      )}
      {error ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <TableSkeleton />
        : data && data.items.length === 0 ? (
          <EmptyState title={filtered ? "No payments match your filters" : "No payments yet"} hint={filtered ? "Try different filters." : "Record a payment when money is received from a client."}
            action={!filtered ? <Button variant="contained" onClick={() => setRecording(true)}>Record payment</Button> : undefined} />
        ) : (
          <>
            <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>Receipt</TableCell>{!clientId && <TableCell>Client</TableCell>}<TableCell>Date</TableCell><TableCell>Method</TableCell>
                    <TableCell align="right">Amount</TableCell><TableCell align="right">Unallocated</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.items.map((p) => (
                    <TableRow key={p.id} hover sx={{ cursor: "pointer", opacity: p.voided_at ? 0.55 : 1 }} onClick={() => router.push(`/payments/${p.id}`)}>
                      <TableCell>
                        <Link href={`/payments/${p.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>{p.receipt_number}</Link>
                        {p.voided_at && <Chip size="small" label="Voided" sx={{ ml: 1 }} />}
                        {p.reference && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{p.reference}</Box>}
                      </TableCell>
                      {!clientId && <TableCell>{p.client_name}</TableCell>}
                      <TableCell>{format(parseISO(p.payment_date), "dd MMM yyyy")}</TableCell>
                      <TableCell>{PAYMENT_METHOD_LABELS[p.method as keyof typeof PAYMENT_METHOD_LABELS] ?? p.method}</TableCell>
                      <TableCell align="right">{formatMoney(p.amount)}</TableCell>
                      <TableCell align="right">{p.voided_at ? "—" : formatMoney(p.unallocated)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination component="div" count={data?.total ?? 0} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10, 20, 50, 100]}
              onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} />
          </>
        )}
      {recording && <RecordPaymentDialog clientId={clientId} onClose={() => setRecording(false)} onSaved={(id) => { setRecording(false); router.push(`/payments/${id}`); }} />}
    </Card>
  );

  if (clientId) return body;
  return (
    <>
      <PageHeader title="Payments" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Payments" }]}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setRecording(true)}>Record payment</Button>} />
      {body}
    </>
  );
}
