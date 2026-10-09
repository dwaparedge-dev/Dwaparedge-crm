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
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import SearchIcon from "@mui/icons-material/Search";
import { format } from "date-fns";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { formatMoney } from "@/lib/format";
import { LICENSE_STATUSES } from "../schema";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import type { LicenseRow } from "../service";
import type { ProductRow } from "@/features/products/service";
import { DaysRemaining, LicenseStatusChip } from "./common";

type SortKey = "expiry" | "client" | "created";
const WINDOWS = [["7", "Expiring in 7 days"], ["15", "Expiring in 15 days"], ["30", "Expiring in 30 days"], ["60", "Expiring in 60 days"]] as const;

export function LicensesList({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [status, setStatus] = useState("");
  const [productId, setProductId] = useState("");
  const [within, setWithin] = useState("");
  const [sort, setSort] = useState<SortKey>("expiry");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const products = useFetch<{ items: ProductRow[] }>("/api/products?pageSize=100");

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize), sort, dir });
  if (clientId) qs.set("clientId", clientId);
  if (debounced) qs.set("search", debounced);
  if (status) qs.set("status", status);
  if (productId) qs.set("productId", productId);
  if (within) qs.set("expiringWithin", within);
  const { data, error, loading, reload } = useFetch<{ items: LicenseRow[]; total: number; renewalValue: string }>(`/api/licenses?${qs}`);

  const toggleSort = (k: SortKey) => { setDir(sort === k && dir === "asc" ? "desc" : "asc"); setSort(k); setPage(0); };
  const newHref = clientId ? `/licenses/new?clientId=${clientId}` : "/licenses/new";
  const filtered = Boolean(debounced || status || productId || within);
  const reset = (fn: (v: string) => void) => (e: React.ChangeEvent<HTMLInputElement>) => { fn(e.target.value); setPage(0); };

  const body = (
    <Card variant={clientId ? "elevation" : "outlined"} elevation={0} sx={clientId ? { border: 0 } : undefined}>
      <Box sx={{ p: clientId ? 0 : 2, pb: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
        <TextField size="small" placeholder="Search identifier, client, product, plan" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 260px", maxWidth: 400 }}
          slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search licenses" } }} />
        <TextField select size="small" label="Status" value={status} onChange={reset(setStatus)} sx={{ minWidth: 140 }}>
          <MenuItem value="">All</MenuItem>
          {LICENSE_STATUSES.map((s) => <MenuItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Product" value={productId} onChange={reset(setProductId)} sx={{ minWidth: 180 }}>
          <MenuItem value="">All products</MenuItem>
          {products.data?.items.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>)}
        </TextField>
        <TextField select size="small" label="Expiry" value={within} onChange={reset(setWithin)} sx={{ minWidth: 190 }}>
          <MenuItem value="">Any time</MenuItem>
          <MenuItem value="0">Expired or expiring today</MenuItem>
          {WINDOWS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
        </TextField>
        {clientId && <Box sx={{ ml: "auto" }}><Button component={Link} href={newHref} variant="contained" startIcon={<AddIcon />}>Issue license</Button></Box>}
      </Box>
      {within !== "" && data && data.total > 0 && (
        <Typography variant="body2" color="text.secondary" sx={{ px: clientId ? 0 : 2, pb: 1.5 }}>
          Projected renewal value for these {data.total} license{data.total === 1 ? "" : "s"}: <strong>{formatMoney(data.renewalValue)}</strong>
          {" "}(sum of renewal prices; not invoiced or collected, and excludes licenses without a renewal price).
        </Typography>
      )}
      {error ? <ErrorState message={error} onRetry={reload} />
        : loading && !data ? <TableSkeleton />
        : data && data.items.length === 0 ? (
          <EmptyState title={filtered ? "No licenses match your filters" : "No licenses yet"} hint={filtered ? "Try different filters." : "Issue a license to a client to start the register."}
            action={!filtered ? <Button component={Link} href={newHref} variant="contained">Issue license</Button> : undefined} />
        ) : (
          <>
            <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
              <Table>
                <TableHead>
                  <TableRow>
                    <TableCell>License</TableCell>
                    {!clientId && <TableCell sortDirection={sort === "client" ? dir : false}><TableSortLabel active={sort === "client"} direction={dir} onClick={() => toggleSort("client")}>Client</TableSortLabel></TableCell>}
                    <TableCell>Product / plan</TableCell>
                    <TableCell sortDirection={sort === "expiry" ? dir : false}><TableSortLabel active={sort === "expiry"} direction={dir} onClick={() => toggleSort("expiry")}>Expiry</TableSortLabel></TableCell>
                    <TableCell>Days left</TableCell>
                    <TableCell align="right">Renewal price</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data?.items.map((l) => (
                    <TableRow key={l.id} hover sx={{ cursor: "pointer" }} onClick={() => router.push(`/licenses/${l.id}`)}>
                      <TableCell>
                        <Link href={`/licenses/${l.id}`} onClick={(e) => e.stopPropagation()} style={{ color: "inherit", fontWeight: 600, textDecoration: "none", fontFamily: "monospace" }}>{l.license_identifier}</Link>
                        {l.seat_limit && <Box sx={{ color: "text.secondary", fontSize: 12 }}>{l.seat_limit} seat{l.seat_limit === 1 ? "" : "s"}</Box>}
                      </TableCell>
                      {!clientId && <TableCell>{l.client_name}</TableCell>}
                      <TableCell>{l.product_name}<Box sx={{ color: "text.secondary", fontSize: 13 }}><OptionLabel table="licenses" column="plan" value={l.plan} /></Box></TableCell>
                      <TableCell>{format(new Date(l.expiry_date), "dd MMM yyyy")}</TableCell>
                      <TableCell><DaysRemaining expiry={l.expiry_date} status={l.status} /></TableCell>
                      <TableCell align="right">{formatMoney(l.renewal_price)}</TableCell>
                      <TableCell><LicenseStatusChip status={l.status} /></TableCell>
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
      <PageHeader title="Software Licenses" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Software Licenses" }]}
        actions={<Button component={Link} href={newHref} variant="contained" startIcon={<AddIcon />}>Issue license</Button>} />
      {body}
    </>
  );
}
