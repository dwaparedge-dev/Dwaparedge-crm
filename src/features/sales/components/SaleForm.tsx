"use client";
import { useState } from "react";
import { Controller, useForm, useWatch, type UseFormReturn } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { ClientPicker } from "@/components/common/ClientPicker";
import { LineItemsEditor, EMPTY_LINE, useItemsTotals, type ItemsForm, type LineItem } from "@/components/forms/LineItemsEditor";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import { SALE_TYPES } from "../schema";
import { SALE_TYPE_LABELS } from "./common";

export type SaleFormItem = LineItem;
export interface SaleFormValues {
  clientId: string;
  type: string;
  title: string;
  ownerId: string;
  saleDate: string;
  expectedClose: string;
  notes: string;
  items: SaleFormItem[];
}

export const emptySale = (clientId = ""): SaleFormValues => ({
  clientId, type: "license", title: "", ownerId: "", saleDate: new Date().toISOString().slice(0, 10), expectedClose: "", notes: "", items: [{ ...EMPTY_LINE }],
});

interface Props {
  initial: SaleFormValues;
  saleId?: string;
  lockClient?: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export function SaleForm({ initial, saleId, lockClient, onSaved, onCancel }: Props) {
  const form = useForm<SaleFormValues>({ defaultValues: initial });
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = form;
  const totals = useItemsTotals(useWatch({ control, name: "items" }));
  const owners = useFetch<{ items: { id: string; name: string }[] }>("/api/users/options");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(values: SaleFormValues) {
    setFormError(null);
    try {
      if (saleId) {
        await api(`/api/sales/${saleId}`, { method: "PATCH", body: values });
        onSaved(saleId);
      } else {
        const { id } = await api<{ id: string }>("/api/sales", { method: "POST", body: values });
        onSaved(id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        for (const issue of e.details.issues) {
          const path = issue.path.join(".");
          setError(path as keyof SaleFormValues, { message: issue.message });
        }
        setFormError("Please fix the highlighted fields.");
        return;
      }
      setFormError(e instanceof Error ? e.message : "Could not save the sale");
    }
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit(submit)}>
      {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Sale details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="clientId" control={control} rules={{ required: "Select a client" }} render={({ field, fieldState }) => (
                <ClientPicker value={field.value} disabled={lockClient} error={fieldState.error?.message} onChange={(id) => field.onChange(id)} />
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="type" control={control} render={({ field }) => (
                <TextField select label="Sale type" fullWidth {...field}>
                  {SALE_TYPES.map((t) => <MenuItem key={t} value={t}>{SALE_TYPE_LABELS[t]}</MenuItem>)}
                </TextField>
              )} />
            </Grid>
            <Grid size={12}>
              <TextField label="Title" required fullWidth placeholder="e.g. FactoONE annual license" {...register("title", { required: "Title is required" })} error={Boolean(errors.title)} helperText={errors.title?.message} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Sale date" type="date" required fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("saleDate", { required: "Date is required" })} error={Boolean(errors.saleDate)} helperText={errors.saleDate?.message} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField label="Expected closing" type="date" fullWidth slotProps={{ inputLabel: { shrink: true } }} {...register("expectedClose")} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Controller name="ownerId" control={control} render={({ field }) => (
                <TextField select label="Owner" fullWidth {...field} disabled={owners.loading}>
                  <MenuItem value=""><em>Unassigned</em></MenuItem>
                  {owners.data?.items.map((u) => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
                </TextField>
              )} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 0.5 }}>Items</Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Pick a catalog item to fill the price and GST, or type your own. Prices are saved with the sale and don’t change if the catalog changes.</Typography>
          <LineItemsEditor
            form={form as unknown as UseFormReturn<ItemsForm>}
            initialItems={initial.items}
            totalLabel="Estimated total"
            footnote="Preview only. The saved totals are recalculated on the server. The final tax split (CGST/SGST or IGST) is decided on the invoice."
          />
        </CardContent>
      </Card>

      <Card sx={{ mb: 3 }}>
        <CardContent>
          <TextField label="Notes" multiline minRows={3} fullWidth {...register("notes")} />
        </CardContent>
      </Card>

      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={isSubmitting || totals === null}>{isSubmitting ? "Saving…" : saleId ? "Save changes" : "Create sale"}</Button>
      </Box>
    </Box>
  );
}
