"use client";
import { useEffect, useState } from "react";
import Grid from "@mui/material/Grid";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { api } from "@/lib/api-client";
import { formatMoney } from "@/lib/format";
import type { InvoiceRow } from "@/features/invoices/service";
import type { SaleRow } from "@/features/sales/service";

/** Debounced server search; `url` null = skip. */
function useSearch<T>(url: ((q: string) => string) | null, q: string, deps: unknown[]): T[] {
  const [items, setItems] = useState<T[]>([]);
  useEffect(() => {
    if (!url) return;
    let cancelled = false;
    const t = setTimeout(() => {
      api<{ items: T[] }>(url(q)).then((d) => !cancelled && setItems(d.items)).catch(() => !cancelled && setItems([]));
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, ...deps]);
  return items;
}

interface Props {
  clientId: string;
  saleId: string;
  invoiceId: string;
  lockSale?: boolean;
  lockInvoice?: boolean;
  /** Picking a sale sets the client; picking an invoice sets the client and the sale. */
  onPickSale: (sale: SaleRow | null) => void;
  onPickInvoice: (invoice: InvoiceRow | null) => void;
}

/** Sale-order and invoice-number pickers for the Record payment popup. */
export function PaymentLinkPickers({ clientId, saleId, invoiceId, lockSale, lockInvoice, onPickSale, onPickInvoice }: Props) {
  const [saleQ, setSaleQ] = useState("");
  const [invQ, setInvQ] = useState("");
  const sales = useSearch<SaleRow>(
    (q) => `/api/sales?pageSize=30&search=${encodeURIComponent(q)}${clientId ? `&clientId=${clientId}` : ""}`, saleQ, [clientId],
  ).filter((s) => s.status === "confirmed" || s.status === "completed");
  const invoices = useSearch<InvoiceRow>(
    (q) => `/api/invoices?openOnly=true&pageSize=30&search=${encodeURIComponent(q)}${clientId ? `&clientId=${clientId}` : ""}${saleId ? `&saleId=${saleId}` : ""}`, invQ, [clientId, saleId],
  );
  // Remember what was picked: an invoice pick sets the sale, which may not be in the current search results.
  const [pickedSale, setPickedSale] = useState<SaleRow | null>(null);
  const [pickedInvoice, setPickedInvoice] = useState<InvoiceRow | null>(null);
  const sale = sales.find((s) => s.id === saleId) ?? (pickedSale?.id === saleId ? pickedSale : null);
  const invoice = invoices.find((i) => i.id === invoiceId) ?? (pickedInvoice?.id === invoiceId ? pickedInvoice : null);

  return (
    <>
      <Grid size={{ xs: 12, md: 4 }}>
      <Autocomplete
        fullWidth
        options={sales}
        value={sale}
        disabled={lockSale}
        filterOptions={(x) => x}
        getOptionLabel={(s) => s.title ? `${s.sale_number} · ${s.title}` : s.sale_number}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onInputChange={(_, v, reason) => reason !== "reset" && setSaleQ(v)}
        onChange={(_, s) => { setPickedSale(s); onPickSale(s); }}
        noOptionsText="No confirmed sale found"
        renderOption={(props, s) => (
          <li {...props} key={s.id}>{s.sale_number} · {s.title}<Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{s.client_name} · {formatMoney(s.balance_remaining)} remaining</Typography></li>
        )}
        renderInput={(params) => <TextField {...params} label="Sale order (optional)" placeholder="Search sale number" />}
      />
      </Grid>
      <Grid size={{ xs: 12, md: 4 }}>
      <Autocomplete
        fullWidth
        options={invoices}
        value={invoice}
        disabled={lockInvoice}
        filterOptions={(x) => x}
        getOptionLabel={(i) => `${i.invoice_number ?? "Draft"}`}
        isOptionEqualToValue={(a, b) => a.id === b.id}
        onInputChange={(_, v, reason) => reason !== "reset" && setInvQ(v)}
        onChange={(_, i) => { setPickedInvoice(i); setPickedSale(i ? ({ id: i.sale_id, sale_number: i.sale_number, title: "", client_name: i.client_name, balance_remaining: i.balance_due } as SaleRow) : null); onPickInvoice(i); }}
        noOptionsText="No open invoice found"
        renderOption={(props, i) => (
          <li {...props} key={i.id}>{i.invoice_number}<Typography variant="caption" color="text.secondary" sx={{ ml: 1 }}>{i.client_name} · {i.sale_number} · balance {formatMoney(i.balance_due)}</Typography></li>
        )}
        renderInput={(params) => <TextField {...params} label="Invoice number (optional)" placeholder="Search invoice number" />}
      />
      </Grid>
    </>
  );
}
