"use client";
import { useState } from "react";
import { Controller, useFieldArray, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import Link from "next/link";
import { FormShell } from "@/components/common/FormShell";
import { ApiError, api } from "@/lib/api-client";
import { INDIAN_STATES } from "@/lib/india";
import type { LineItem } from "@/components/forms/LineItemsEditor";
import type { SaleItemRow } from "@/features/sales/service";
import { InvoiceLinesEditor } from "./InvoiceLinesEditor";

export interface InvoiceFormValues {
  saleId: string;
  issueDate: string;
  dueDate: string;
  placeOfSupplyStateCode: string;
  paymentTerms: string;
  notes: string;
  items: (LineItem & { saleItemId: string })[];
}

interface Props {
  open: boolean;
  initial: InvoiceFormValues;
  invoiceId: string;
  saleNumber: string;
  saleItems: SaleItemRow[];
  ownTaxable: Record<string, string>;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

/** Edits a draft. Drafts are created from a sale (“Create invoice”), so this never starts from nothing. */
export function InvoiceForm({ open, initial, invoiceId, saleNumber, saleItems, ownTaxable, onSaved, onCancel }: Props) {
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<InvoiceFormValues>({ defaultValues: initial });
  const { append, remove } = useFieldArray({ control, name: "items" });
  const [formError, setFormError] = useState<{ message: string; settings?: boolean } | null>(null);

  async function submit(values: InvoiceFormValues) {
    setFormError(null);
    try {
      await api(`/api/invoices/${invoiceId}`, { method: "PATCH", body: values });
      onSaved(invoiceId);
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
    <FormShell open={open} title="Edit draft invoice" maxWidth="lg" onClose={onCancel} onSubmit={handleSubmit(submit)} submitting={isSubmitting} submitLabel="Save draft">
      {formError && (
        <Alert severity="error" sx={{ mb: 2 }} action={formError.settings ? <Button color="inherit" size="small" component={Link} href="/settings">Open Settings</Button> : undefined}>
          {formError.message}
        </Alert>
      )}
      <Alert severity="info" sx={{ mb: 2 }}>Draft against sale <strong>{saleNumber}</strong>. The invoice number is assigned, and the invoice becomes permanent, only when you issue it. You can bill less than the sale line, but not more than is left.</Alert>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Invoice details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="placeOfSupplyStateCode" control={control} render={({ field }) => (
                <TextField select label="Place of supply" fullWidth {...field} helperText={errors.placeOfSupplyStateCode?.message ?? "Blank = the client’s state. Decides CGST+SGST vs IGST."} error={Boolean(errors.placeOfSupplyStateCode)}>
                  <MenuItem value=""><em>Client’s state</em></MenuItem>
                  {INDIAN_STATES.map((s) => <MenuItem key={s.code} value={s.code}>{s.name} ({s.code})</MenuItem>)}
                </TextField>
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Invoice date" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("issueDate", { required: "Required" })} error={Boolean(errors.issueDate)} helperText={errors.issueDate?.message} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Due date" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("dueDate", { required: "Required" })} error={Boolean(errors.dueDate)} helperText={errors.dueDate?.message} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Lines</Typography>
          <InvoiceLinesEditor control={control} register={register} errors={errors} saleItems={saleItems} ownTaxable={ownTaxable} append={append} remove={remove} />
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          <Grid container spacing={2}>
            <Grid size={12}><TextField label="Payment terms" multiline minRows={2} fullWidth {...register("paymentTerms")} /></Grid>
            <Grid size={12}><TextField label="Notes (printed on the invoice)" multiline minRows={2} fullWidth {...register("notes")} /></Grid>
          </Grid>
        </CardContent>
      </Card>
    </FormShell>
  );
}
