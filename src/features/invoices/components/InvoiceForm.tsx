"use client";
import { useState } from "react";
import { Controller, useForm, type UseFormReturn } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { addDays, format, parseISO } from "date-fns";
import { ClientPicker } from "@/components/common/ClientPicker";
import { LineItemsEditor, EMPTY_LINE, type ItemsForm, type LineItem } from "@/components/forms/LineItemsEditor";
import { ApiError, api } from "@/lib/api-client";
import { INDIAN_STATES } from "@/lib/india";
import { INVOICE_TYPES, INVOICE_TYPE_LABELS } from "../schema";

export interface InvoiceFormValues {
  clientId: string;
  invoiceType: string;
  issueDate: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  paymentTerms: string;
  notes: string;
  items: LineItem[];
}

export const emptyInvoice = (clientId = "", dueDays = 15, terms = "", notes = ""): InvoiceFormValues => {
  const today = new Date().toISOString().slice(0, 10);
  return {
    clientId, invoiceType: "software_sale", issueDate: today, dueDate: format(addDays(parseISO(today), dueDays), "yyyy-MM-dd"),
    placeOfSupplyStateCode: "", paymentTerms: terms, notes, items: [{ ...EMPTY_LINE }],
  };
};

interface Props {
  initial: InvoiceFormValues;
  invoiceId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export function InvoiceForm({ initial, invoiceId, onSaved, onCancel }: Props) {
  const form = useForm<InvoiceFormValues>({ defaultValues: initial });
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = form;
  const [formError, setFormError] = useState<{ message: string; settings?: boolean } | null>(null);

  async function submit(values: InvoiceFormValues) {
    setFormError(null);
    try {
      if (invoiceId) {
        await api(`/api/invoices/${invoiceId}`, { method: "PATCH", body: values });
        onSaved(invoiceId);
      } else {
        const { id } = await api<{ id: string }>("/api/invoices", { method: "POST", body: values });
        onSaved(id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        for (const i of e.details.issues) setError(i.path.join(".") as keyof InvoiceFormValues, { message: i.message });
        setFormError({ message: "Please fix the highlighted fields." });
        return;
      }
      const msg = e instanceof Error ? e.message : "Could not save the invoice";
      setFormError({ message: msg, settings: /company state|Settings/.test(msg) });
    }
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit(submit)}>
      {formError && (
        <Alert severity="error" sx={{ mb: 2 }} action={formError.settings ? <Button color="inherit" size="small" component={Link} href="/settings">Open Settings</Button> : undefined}>
          {formError.message}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2 }}>This is saved as a draft. The invoice number is assigned, and the invoice becomes permanent, only when you issue it.</Alert>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Invoice details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="clientId" control={control} rules={{ required: "Select a client" }} render={({ field, fieldState }) => (
                <ClientPicker value={field.value} disabled={Boolean(invoiceId)} error={fieldState.error?.message} onChange={(id) => field.onChange(id)} />
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="invoiceType" control={control} render={({ field }) => (
                <TextField select label="Invoice type" fullWidth {...field}>
                  {INVOICE_TYPES.map((t) => <MenuItem key={t} value={t}>{INVOICE_TYPE_LABELS[t]}</MenuItem>)}
                </TextField>
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Invoice date" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("issueDate", { required: "Required" })} error={Boolean(errors.issueDate)} helperText={errors.issueDate?.message} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Due date" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("dueDate", { required: "Required" })} error={Boolean(errors.dueDate)} helperText={errors.dueDate?.message} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Controller name="placeOfSupplyStateCode" control={control} render={({ field }) => (
                <TextField select label="Place of supply" fullWidth {...field} helperText={errors.placeOfSupplyStateCode?.message ?? "Blank = the client’s state. Decides CGST+SGST vs IGST."} error={Boolean(errors.placeOfSupplyStateCode)}>
                  <MenuItem value=""><em>Client’s state</em></MenuItem>
                  {INDIAN_STATES.map((s) => <MenuItem key={s.code} value={s.code}>{s.name} ({s.code})</MenuItem>)}
                </TextField>
              )} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Items</Typography>
          <LineItemsEditor
            form={form as unknown as UseFormReturn<ItemsForm>}
            initialItems={initial.items}
            totalLabel="Estimated total"
            footnote="Preview. The server calculates the final CGST/SGST or IGST split, round-off and total when you save."
          />
        </CardContent>
      </Card>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={12}><TextField label="Payment terms" multiline minRows={2} fullWidth {...register("paymentTerms")} /></Grid>
            <Grid size={12}><TextField label="Notes (printed on the invoice)" multiline minRows={2} fullWidth {...register("notes")} /></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? "Saving…" : invoiceId ? "Save draft" : "Create draft"}</Button>
      </Box>
    </Box>
  );
}
