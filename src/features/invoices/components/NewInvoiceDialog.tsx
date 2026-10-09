"use client";
import { autocompleteLoading } from "@/components/common/loading";
import { useEffect, useState } from "react";
import Box from "@mui/material/Box";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import CloseIcon from "@mui/icons-material/Close";
import Alert from "@mui/material/Alert";
import Autocomplete from "@mui/material/Autocomplete";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useNotify } from "@/components/common/Notify";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import { BillSaleForm } from "@/features/sales/components/BillSaleForm";
import type { MilestoneRow, SaleItemRow, SaleRow } from "@/features/sales/service";

type Detail = SaleRow & { items: SaleItemRow[]; milestones: MilestoneRow[] };

/** Invoices are raised against a sale: choose the sale, then how much of it to bill. */
export function NewInvoiceDialog({ saleId: initialSale, clientId, onClose, onCreated }: { saleId?: string; clientId?: string; onClose: () => void; onCreated?: () => void }) {
  const notify = useNotify();
  const [saleId, setSaleId] = useState(initialSale ?? "");
  const [search, setSearch] = useState("");
  const [options, setOptions] = useState<SaleRow[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const sale = useFetch<Detail>(saleId ? `/api/sales/${saleId}` : null);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoadingOptions(true);
      const qs = new URLSearchParams({ status: "confirmed", pageSize: "30", search });
      if (clientId) qs.set("clientId", clientId);
      api<{ items: SaleRow[] }>(`/api/sales?${qs}`).then((d) => !cancelled && setOptions(d.items.filter((s) => Number(s.to_bill_taxable) > 0))).catch(() => !cancelled && setOptions([])).finally(() => !cancelled && setLoadingOptions(false));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [search, clientId]);

  return (
    <Dialog open onClose={onClose} maxWidth="md" fullWidth slotProps={{ paper: { sx: { borderRadius: 3 } } }}>
      <DialogTitle sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", pt: 2.5, pb: 2, borderBottom: "1px solid var(--mui-palette-divider)" }}>
        <Box component="span" sx={{ fontWeight: 700, fontSize: "1.1rem" }}>New invoice</Box>
        <IconButton onClick={onClose} size="small" aria-label="Close"><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>
      <DialogContent sx={{ "&&": { pt: 2.5 }, "& .MuiCard-root": { boxShadow: "none", border: "1px solid var(--mui-palette-divider)", borderRadius: 2, mb: 2 } }}>
      <Alert severity="info" sx={{ mb: 2 }}>Every invoice is raised against a sale. Pick a confirmed sale that still has something left to bill. To bill something new, add it to a sale first.</Alert>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Autocomplete
            options={options}
            loading={loadingOptions}
            value={options.find((o) => o.id === saleId) ?? (sale.data ?? null)}
            getOptionLabel={(s) => `${s.sale_number} · ${s.client_name} · ${s.title}`}
            isOptionEqualToValue={(a, b) => a.id === b.id}
            filterOptions={(x) => x}
            onInputChange={(_, v, reason) => reason !== "reset" && setSearch(v)}
            onChange={(_, s) => setSaleId(s?.id ?? "")}
            renderOption={(props, s) => (
              <li {...props} key={s.id}>{s.sale_number} · {s.client_name} · {s.title}<Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{formatMoney(s.balance_remaining)} remaining</Typography></li>
            )}
            renderInput={(params) => <TextField {...params} slotProps={autocompleteLoading(params, loadingOptions)} label="Sale to invoice" required helperText={options.length === 0 && !saleId ? "No confirmed sale with something left to bill" : undefined} />}
          />
        </CardContent>
      </Card>
      {saleId && (
        sale.error ? <ErrorState message={sale.error} onRetry={sale.reload} />
        : !sale.data ? <Skeleton variant="rounded" height={260} />
        : sale.data.status !== "confirmed" ? <Alert severity="warning">Sale {sale.data.sale_number} is {sale.data.status}. Only a confirmed sale can be invoiced.</Alert>
        : (
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>How much of {sale.data.sale_number} to bill</Typography>
              <BillSaleForm saleId={sale.data.id} subtotal={sale.data.subtotal} items={sale.data.items} milestones={sale.data.milestones}
                onCancel={onClose}
                onCreated={() => { notify.success("Draft invoice created. Open it from the list to review and issue it."); onCreated?.(); onClose(); }} />
            </CardContent>
          </Card>
        )
      )}
      </DialogContent>
    </Dialog>
  );
}
