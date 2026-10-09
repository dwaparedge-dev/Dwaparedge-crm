"use client";
import { useEffect, useMemo, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import InputAdornment from "@mui/material/InputAdornment";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TablePagination from "@mui/material/TablePagination";
import TableRow from "@mui/material/TableRow";
import TableSortLabel from "@mui/material/TableSortLabel";
import TextField from "@mui/material/TextField";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { addDays, format, parseISO } from "date-fns";
import { ClientPicker } from "@/components/common/ClientPicker";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { StatCards } from "@/components/common/StatCards";
import CurrencyRupeeIcon from "@mui/icons-material/CurrencyRupee";
import NumbersIcon from "@mui/icons-material/Numbers";
import { useFetch } from "@/components/common/useFetch";
import { RANGE_PRESETS, presetRange, todayIST, type RangePreset } from "@/lib/dates";
import { formatMoney } from "@/lib/format";

export interface ReportMeta {
  key: string;
  title: string;
  description: string;
  definition: string;
  filters: string[];
  dateLabel?: string;
  requiresClient: boolean;
  statusOptions: { value: string; label: string }[];
  columns: { key: string; label: string; type: "text" | "money" | "date" | "number" | "datetime" }[];
  defaultSort: string;
  defaultDir: "asc" | "desc";
  sortable: string[];
}
interface Result {
  rows: Record<string, string | number | null>[];
  total: number;
  summary: { label: string; value: string; type: "money" | "number" }[];
}

const METHODS = [["bank_transfer", "Bank transfer"], ["upi", "UPI"], ["cash", "Cash"], ["cheque", "Cheque"], ["other", "Other"]] as const;
const ENTITIES = ["client", "contact", "sale", "license", "invoice", "payment", "product", "settings"];

/** Sensible starting range per report (null = all time). */
function initialRange(key: string): [string, string] | null {
  const today = todayIST();
  if (key === "renewals") return [today, format(addDays(parseISO(today), 60), "yyyy-MM-dd")];
  if (key === "ledger") return null;
  if (key === "activity") return presetRange("last_30");
  return presetRange("this_month");
}

function Cell({ type, value }: { type: ReportMeta["columns"][number]["type"]; value: string | number | null }) {
  if (value === null || value === undefined || value === "") return <>—</>;
  if (type === "money") return <>{formatMoney(String(value))}</>;
  if (type === "date") return <>{format(parseISO(String(value)), "dd MMM yyyy")}</>;
  return <>{String(value)}</>;
}

export function ReportView({ reportKey }: { reportKey: string }) {
  const catalogue = useFetch<{ items: ReportMeta[] }>("/api/reports");
  const meta = catalogue.data?.items.find((r) => r.key === reportKey);
  if (catalogue.error) return <ErrorState message={catalogue.error} onRetry={catalogue.reload} />;
  if (!meta) return catalogue.data ? <ErrorState message="Report not found." /> : <Skeleton variant="rounded" height={300} />;
  return <ReportBody meta={meta} />;
}

function ReportBody({ meta }: { meta: ReportMeta }) {
  const [range, setRange] = useState<[string, string] | null>(() => initialRange(meta.key));
  const [preset, setPreset] = useState<RangePreset | "custom" | "all">(() => (meta.key === "renewals" ? "custom" : initialRange(meta.key) ? (meta.key === "activity" ? "last_30" : "this_month") : "all"));
  const [clientId, setClientId] = useState("");
  const [status, setStatus] = useState("");
  const [method, setMethod] = useState("");
  const [entityType, setEntityType] = useState("");
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [sort, setSort] = useState(meta.defaultSort);
  const [dir, setDir] = useState<"asc" | "desc">(meta.defaultDir);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const has = (f: string) => meta.filters.includes(f);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const rangeBad = Boolean(range && range[0] && range[1] && range[0] > range[1]);
  const blocked = rangeBad || (meta.requiresClient && !clientId);

  const query = useMemo(() => {
    const q = new URLSearchParams();
    if (range?.[0]) q.set("from", range[0]);
    if (range?.[1]) q.set("to", range[1]);
    if (clientId) q.set("clientId", clientId);
    if (status) q.set("status", status);
    if (method) q.set("method", method);
    if (entityType) q.set("entityType", entityType);
    if (debounced) q.set("search", debounced);
    q.set("sort", sort);
    q.set("dir", dir);
    return q;
  }, [range, clientId, status, method, entityType, debounced, sort, dir]);

  const paging = new URLSearchParams(query);
  paging.set("page", String(page + 1));
  paging.set("pageSize", String(pageSize));
  const { data, error, loading, reload } = useFetch<Result>(blocked ? null : `/api/reports/${meta.key}?${paging}`);
  const exportQuery = new URLSearchParams(query);
  exportQuery.set("format", "csv");

  const resetPage = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPage(0); };
  const toggleSort = (key: string) => { setDir(sort === key && dir === "asc" ? "desc" : "asc"); setSort(key); setPage(0); };

  return (
    <>
      <PageHeader
        title={meta.title}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Reports", href: "/reports" }, { label: meta.title }]}
        actions={
          <Button variant="outlined" startIcon={<DownloadIcon />} href={`/api/reports/${meta.key}?${exportQuery}`} disabled={blocked || !data || data.total === 0}>Export CSV</Button>
        }
      />
      <Alert severity="info" sx={{ mb: 2 }}><strong>What this shows:</strong> {meta.definition}</Alert>
      <Card>
        <CardContent sx={{ pb: 1 }}>
          <Box sx={{ display: "flex", gap: 2, flexWrap: "wrap", alignItems: "flex-start" }}>
            {has("dateRange") && (
              <>
                <TextField select size="small" label={meta.dateLabel ?? "Date"} value={preset} sx={{ minWidth: 190 }}
                  onChange={(e) => {
                    const v = e.target.value as RangePreset | "custom" | "all";
                    setPreset(v); setPage(0);
                    if (v === "all") setRange(null);
                    else if (v !== "custom") setRange(presetRange(v));
                    else if (!range) setRange(presetRange("this_month"));
                  }}>
                  <MenuItem value="all">All time</MenuItem>
                  {RANGE_PRESETS.map((p) => <MenuItem key={p.value} value={p.value}>{p.label}</MenuItem>)}
                  <MenuItem value="custom">Custom range</MenuItem>
                </TextField>
                {range && (
                  <>
                    <TextField size="small" type="date" label="From" value={range[0]} slotProps={{ inputLabel: { shrink: true } }} error={rangeBad} onChange={(e) => { setPreset("custom"); setRange([e.target.value, range[1]]); setPage(0); }} />
                    <TextField size="small" type="date" label="To" value={range[1]} slotProps={{ inputLabel: { shrink: true } }} error={rangeBad} helperText={rangeBad ? "Must be after the start date" : undefined} onChange={(e) => { setPreset("custom"); setRange([range[0], e.target.value]); setPage(0); }} />
                  </>
                )}
              </>
            )}
            {has("client") && (
              <Box sx={{ minWidth: 260 }}><ClientPicker value={clientId} onChange={(id) => { setClientId(id); setPage(0); }} /></Box>
            )}
            {has("status") && (
              <TextField select size="small" label="Status" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">All</MenuItem>
                {meta.statusOptions.map((o) => <MenuItem key={o.value} value={o.value}>{o.label}</MenuItem>)}
              </TextField>
            )}
            {has("method") && (
              <TextField select size="small" label="Method" value={method} onChange={(e) => resetPage(setMethod)(e.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">All methods</MenuItem>
                {METHODS.map(([v, l]) => <MenuItem key={v} value={v}>{l}</MenuItem>)}
              </TextField>
            )}
            {has("entityType") && (
              <TextField select size="small" label="Type" value={entityType} onChange={(e) => resetPage(setEntityType)(e.target.value)} sx={{ minWidth: 160 }}>
                <MenuItem value="">All types</MenuItem>
                {ENTITIES.map((v) => <MenuItem key={v} value={v}>{v[0]!.toUpperCase() + v.slice(1)}</MenuItem>)}
              </TextField>
            )}
            {has("search") && (
              <TextField size="small" placeholder="Search" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ minWidth: 220 }}
                slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search report" } }} />
            )}
          </Box>
        </CardContent>

        {meta.requiresClient && !clientId ? (
          <EmptyState title="Choose a client" hint="This report shows one client's invoices and payments in order." />
        ) : blocked ? (
          <Box sx={{ p: 2 }}><Alert severity="warning">Fix the date range to see results.</Alert></Box>
        ) : error ? (
          <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box>
        ) : !data ? (
          <TableSkeleton cols={meta.columns.length} />
        ) : (
          <>
            {data.summary.length > 0 && (
              <Box sx={{ px: 2, pt: 2 }}>
                <StatCards stats={data.summary.map((x) => ({ label: x.label, value: x.type === "money" ? formatMoney(x.value) : x.value, icon: x.type === "money" ? <CurrencyRupeeIcon /> : <NumbersIcon /> }))} />
              </Box>
            )}
            {data.rows.length === 0 ? <EmptyState title="No results" hint="Nothing matches these filters." /> : (
              <>
                <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {meta.columns.map((c) => {
                          const right = c.type === "money" || c.type === "number";
                          return (
                            <TableCell key={c.key} align={right ? "right" : "left"} sortDirection={sort === c.key ? dir : false}>
                              {meta.sortable.includes(c.key) ? <TableSortLabel active={sort === c.key} direction={dir} onClick={() => toggleSort(c.key)}>{c.label}</TableSortLabel> : c.label}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {data.rows.map((r, i) => (
                        <TableRow key={i} hover>
                          {meta.columns.map((c) => (
                            <TableCell key={c.key} align={c.type === "money" || c.type === "number" ? "right" : "left"} sx={c.key === "summary" ? { maxWidth: 480 } : undefined}>
                              <Cell type={c.type} value={r[c.key] ?? null} />
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </TableContainer>
                <TablePagination component="div" count={data.total} page={page} rowsPerPage={pageSize} rowsPerPageOptions={[10, 25, 50, 100]}
                  onPageChange={(_, p) => setPage(p)} onRowsPerPageChange={(e) => { setPageSize(Number(e.target.value)); setPage(0); }} />
              </>
            )}
          </>
        )}
      </Card>
    </>
  );
}
