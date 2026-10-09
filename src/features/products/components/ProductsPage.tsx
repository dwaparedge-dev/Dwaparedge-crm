"use client";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
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
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";
import EditIcon from "@mui/icons-material/EditOutlined";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { DataTable } from "@/components/common/DataTable";
import { StatCards } from "@/components/common/StatCards";
import Inventory2Icon from "@mui/icons-material/Inventory2Outlined";
import CheckCircleIcon from "@mui/icons-material/CheckCircleOutlined";
import PauseCircleIcon from "@mui/icons-material/PauseCircleOutlined";
import CategoryIcon from "@mui/icons-material/CategoryOutlined";
import { ListLayout } from "@/components/common/ListLayout";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import type { GridColDef } from "@mui/x-data-grid";
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
  const { data, error, loading, reload } = useFetch<{ items: ProductRow[]; total: number; summary: { total: number; active: number; inactive: number; types: number } }>(`/api/products?${qs}`);

  const show = (p: ProductRow | null) => { setEditing(p); setDialogKey((k) => k + 1); setOpen(true); };

  const columns: GridColDef<ProductRow>[] = [
    {
      field: "name", headerName: "Name", minWidth: 220,
      renderCell: ({ row: p }) => (
        <Box>
          <Box sx={{ fontWeight: 600 }}>{p.name}</Box>
          {p.sku && <Box sx={{ color: "text.secondary", fontSize: 13 }}>{p.sku}</Box>}
        </Box>
      ),
    },
    { field: "type", headerName: "Type", width: 190, renderCell: ({ row: p }) => <OptionLabel table="products" column="type" value={p.type} /> },
    { field: "hsn_sac", headerName: "HSN/SAC", width: 120, valueFormatter: (v: string | null) => v ?? "—" },
    { field: "default_price", headerName: "Default price", width: 140, align: "right", headerAlign: "right", valueFormatter: (v: string) => formatMoney(v) },
    { field: "gst_rate", headerName: "GST", width: 90, align: "right", headerAlign: "right", valueFormatter: (v: string) => (Number(v) === 0 ? "Exempt" : `${Number(v)}%`) },
    { field: "is_active", headerName: "Status", width: 110, renderCell: ({ row: p }) => <Chip size="small" variant="outlined" label={p.is_active ? "Active" : "Inactive"} color={p.is_active ? "success" : "default"} /> },
    { field: "actions", headerName: "Edit", width: 80, align: "right", headerAlign: "right", renderCell: ({ row: p }) => <IconButton aria-label={`Edit ${p.name}`} onClick={(e) => { e.stopPropagation(); show(p); }}><EditIcon fontSize="small" /></IconButton> },
  ];
  const filtered = Boolean(debounced || type || active);

  return (
    <>
      <PageHeader
        title="Products & Services" subtitle="The catalogue you sell, with default prices and GST"
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Products & Services" }]}
        actions={<Button variant="contained" startIcon={<AddIcon />} onClick={() => show(null)}>Add product</Button>}
      />
      <StatCards loading={!data} stats={[
        { label: "Products & services", value: data?.summary.total ?? 0, hint: "in the catalogue", icon: <Inventory2Icon />, onClick: () => { setActive(""); setPage(0); } },
        { label: "Active", value: data?.summary.active ?? 0, hint: "available for new sales", icon: <CheckCircleIcon />, selected: active === "true", onClick: () => { setActive("true"); setPage(0); } },
        { label: "Inactive", value: data?.summary.inactive ?? 0, hint: "hidden from new sales", icon: <PauseCircleIcon />, selected: active === "false", onClick: () => { setActive("false"); setPage(0); } },
        { label: "Types in use", value: data?.summary.types ?? 0, hint: "product types", icon: <CategoryIcon /> },
      ]} />
      <ListLayout
        onRefresh={reload} refreshing={loading}
        search={{ value: search, onChange: setSearch, placeholder: "Search name, SKU, description", label: "Search products" }}
        filters={<OptionFilter table="products" column="type" label="Type" value={type} onChange={(v) => { setType(v); setPage(0); }} minWidth={200} />}
        tabs={<SegmentedTabs label="Product status" value={active} onChange={(v) => { setActive(v); setPage(0); }} tabs={[{ value: "", label: "All" }, { value: "true", label: "Active" }, { value: "false", label: "Inactive" }]} />}
      >
        {error ? <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box> : (
          <DataTable<ProductRow>
            label="Products" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
            page={page} pageSize={pageSize} onPageChange={(p, size) => { setPage(p); setPageSize(size); }}
            onRowClick={(p) => show(p)}
            emptyTitle={filtered ? "No products match your filters" : "No products yet"} emptyHint="Add the software, subscriptions and services you sell."
            emptyAction={!filtered ? <Button variant="contained" onClick={() => show(null)}>Add product</Button> : undefined}
          />
        )}
      </ListLayout>
      <ProductDialog key={dialogKey} product={editing} open={open} onClose={() => setOpen(false)} onSaved={() => { setOpen(false); reload(); }} />
    </>
  );
}
