"use client";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Checkbox from "@mui/material/Checkbox";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
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
import EditIcon from "@mui/icons-material/EditOutlined";
import SearchIcon from "@mui/icons-material/Search";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { OptionFilter, OptionLabel, OptionSelect } from "@/features/options/components/OptionSelect";
import type { ProductRow } from "../service";

interface FormValues {
  name: string;
  sku: string;
  type: string;
  description: string;
  hsnSac: string;
  defaultPrice: string;
  gstRate: string;
  isActive: boolean;
}
const EMPTY: FormValues = { name: "", sku: "", type: "software_license", description: "", hsnSac: "", defaultPrice: "0", gstRate: "18", isActive: true };

function ProductDialog({ product, open, onClose, onSaved }: { product: ProductRow | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: product
      ? { name: product.name, sku: product.sku ?? "", type: product.type, description: product.description ?? "", hsnSac: product.hsn_sac ?? "",
          defaultPrice: product.default_price, gstRate: product.gst_rate, isActive: product.is_active }
      : EMPTY,
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(values: FormValues) {
    setFormError(null);
    try {
      if (product) await api(`/api/products/${product.id}`, { method: "PATCH", body: values });
      else await api("/api/products", { method: "POST", body: values });
      notify.success(product ? "Product updated" : "Product created");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        for (const i of e.details.issues) {
          const f = String(i.path[0] ?? "");
          if (f in EMPTY) setError(f as keyof FormValues, { message: i.message });
        }
      }
      setFormError(e instanceof Error ? e.message : "Could not save product");
    }
  }

  const f = (n: keyof FormValues) => ({ error: Boolean(errors[n]), helperText: errors[n]?.message as string | undefined });

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <Box component="form" noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle>{product ? "Edit product / service" : "Add product / service"}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ pt: 1 }}>
            {formError && <Grid size={12}><Alert severity="error">{formError}</Alert></Grid>}
            {product && <Grid size={12}><Alert severity="info">Changes apply to new sales and invoices only. Existing ones keep their original prices and tax.</Alert></Grid>}
            <Grid size={{ xs: 12, sm: 8 }}><TextField label="Name" required fullWidth autoFocus {...register("name", { required: "Name is required" })} {...f("name")} /></Grid>
            <Grid size={{ xs: 12, sm: 4 }}><TextField label="SKU" fullWidth {...register("sku")} {...f("sku")} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <Controller name="type" control={control} rules={{ required: "Select a type" }} render={({ field, fieldState }) => (
                <OptionSelect table="products" column="type" label="Type" required value={field.value} onChange={field.onChange} error={fieldState.error?.message} />
              )} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}><TextField label="HSN / SAC code" fullWidth {...register("hsnSac")} {...f("hsnSac")} /></Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="Default price" fullWidth inputMode="decimal" slotProps={{ input: { startAdornment: <InputAdornment position="start">₹</InputAdornment> } }}
                {...register("defaultPrice", { required: "Price is required", pattern: { value: /^\d+(\.\d{1,2})?$/, message: "Use a number with up to 2 decimals" } })} {...f("defaultPrice")} />
            </Grid>
            <Grid size={{ xs: 12, sm: 6 }}>
              <TextField label="GST rate" fullWidth inputMode="decimal" slotProps={{ input: { endAdornment: <InputAdornment position="end">%</InputAdornment> } }}
                {...register("gstRate", { pattern: { value: /^\d+(\.\d{1,2})?$/, message: "Use a number with up to 2 decimals" } })} {...f("gstRate")} helperText={errors.gstRate?.message ?? "Use 0 for exempt supplies"} />
            </Grid>
            <Grid size={12}><TextField label="Description" multiline minRows={2} fullWidth {...register("description")} {...f("description")} /></Grid>
            <Grid size={12}>
              <FormControlLabel control={<Checkbox {...register("isActive")} defaultChecked={product?.is_active ?? true} />} label="Active (available for new sales)" />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function ProductsPage() {
  const [search, setSearch] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState("");
  const [active, setActive] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(20);
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [open, setOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => { setDebounced(search.trim()); setPage(0); }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const qs = new URLSearchParams({ page: String(page + 1), pageSize: String(pageSize) });
  if (debounced) qs.set("search", debounced);
  if (type) qs.set("type", type);
  if (active) qs.set("active", active);
  const { data, error, loading, reload } = useFetch<{ items: ProductRow[]; total: number }>(`/api/products?${qs}`);

  const show = (p: ProductRow | null) => { setEditing(p); setDialogKey((k) => k + 1); setOpen(true); };

  return (
    <>
      <PageHeader
        title="Products & Services"
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Products & Services" }]}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => show(null)}>Add product</Button>}
      />
      <Card>
        <Box sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap" }}>
          <TextField size="small" placeholder="Search name, SKU, description" value={search} onChange={(e) => setSearch(e.target.value)} sx={{ flex: "1 1 260px", maxWidth: 420 }}
            slotProps={{ input: { startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }, htmlInput: { "aria-label": "Search products" } }} />
          <OptionFilter table="products" column="type" label="Type" value={type} onChange={(v) => { setType(v); setPage(0); }} minWidth={200} />
          <TextField select size="small" label="Status" value={active} onChange={(e) => { setActive(e.target.value); setPage(0); }} sx={{ minWidth: 140 }}>
            <MenuItem value="">All</MenuItem>
            <MenuItem value="true">Active</MenuItem>
            <MenuItem value="false">Inactive</MenuItem>
          </TextField>
        </Box>
        {error ? <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box>
          : loading && !data ? <TableSkeleton />
          : data && data.items.length === 0 ? (
            <EmptyState title={debounced || type || active ? "No products match your filters" : "No products yet"} hint="Add the software, subscriptions and services you sell."
              action={!debounced && !type && !active ? <Button variant="contained" onClick={() => show(null)}>Add product</Button> : undefined} />
          ) : (
            <>
              <TableContainer sx={{ opacity: loading ? 0.6 : 1 }}>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell><TableCell>Type</TableCell><TableCell>HSN/SAC</TableCell>
                      <TableCell align="right">Default price</TableCell><TableCell align="right">GST</TableCell><TableCell>Status</TableCell><TableCell align="right">Edit</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {data?.items.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>
                          <Box sx={{ fontWeight: 600 }}>{p.name}</Box>
                          {p.sku && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{p.sku}</Box>}
                        </TableCell>
                        <TableCell><OptionLabel table="products" column="type" value={p.type} /></TableCell>
                        <TableCell>{p.hsn_sac ?? "—"}</TableCell>
                        <TableCell align="right">{formatMoney(p.default_price)}</TableCell>
                        <TableCell align="right">{Number(p.gst_rate) === 0 ? "Exempt" : `${Number(p.gst_rate)}%`}</TableCell>
                        <TableCell><Chip size="small" variant="outlined" label={p.is_active ? "Active" : "Inactive"} color={p.is_active ? "success" : "default"} /></TableCell>
                        <TableCell align="right"><IconButton aria-label={`Edit ${p.name}`} onClick={() => show(p)}><EditIcon fontSize="small" /></IconButton></TableCell>
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
      <ProductDialog key={dialogKey} product={editing} open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />
    </>
  );
}
