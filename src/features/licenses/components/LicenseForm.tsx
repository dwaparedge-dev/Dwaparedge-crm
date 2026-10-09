"use client";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
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
import { OptionSelect } from "@/features/options/components/OptionSelect";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import type { ProductRow } from "@/features/products/service";

export interface LicenseFormValues {
  clientId: string;
  productId: string;
  plan: string;
  startDate: string;
  expiryDate: string;
  seatLimit: string;
  renewalPrice: string;
  renewalTerms: string;
  notes: string;
}

export const emptyLicense = (clientId = ""): LicenseFormValues => ({
  clientId, productId: "", plan: "", startDate: new Date().toISOString().slice(0, 10), expiryDate: "", seatLimit: "", renewalPrice: "", renewalTerms: "", notes: "",
});

interface Props {
  initial: LicenseFormValues;
  licenseId?: string;
  /** Issued licenses keep their client, product and dates (dates change through Renew). */
  lockIdentity?: boolean;
  lockDates?: boolean;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export function LicenseForm({ initial, licenseId, lockIdentity, lockDates, onSaved, onCancel }: Props) {
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<LicenseFormValues>({ defaultValues: initial });
  const products = useFetch<{ items: ProductRow[] }>("/api/products?pageSize=100");
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(values: LicenseFormValues) {
    setFormError(null);
    try {
      if (licenseId) {
        await api(`/api/licenses/${licenseId}`, { method: "PATCH", body: values });
        onSaved(licenseId);
      } else {
        const { id } = await api<{ id: string }>("/api/licenses", { method: "POST", body: values });
        onSaved(id);
      }
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        for (const i of e.details.issues) setError(String(i.path[0] ?? "") as keyof LicenseFormValues, { message: i.message });
        setFormError("Please fix the highlighted fields.");
        return;
      }
      setFormError(e instanceof Error ? e.message : "Could not save the license");
    }
  }

  const f = (n: keyof LicenseFormValues) => ({ error: Boolean(errors[n]), helperText: errors[n]?.message as string | undefined });

  return (
    <Box component="form" noValidate onSubmit={handleSubmit(submit)}>
      {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>License</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="clientId" control={control} rules={{ required: "Select a client" }} render={({ field, fieldState }) => (
                <ClientPicker value={field.value} disabled={lockIdentity} error={fieldState.error?.message} onChange={(id) => field.onChange(id)} />
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="productId" control={control} rules={{ required: "Select a product" }} render={({ field }) => (
                <TextField select label="Product" required fullWidth {...field} disabled={lockIdentity || products.loading} {...f("productId")}>
                  {products.data?.items.map((p) => <MenuItem key={p.id} value={p.id}>{p.name}{!p.is_active && " (inactive)"}</MenuItem>)}
                </TextField>
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller name="plan" control={control} rules={{ required: "Plan is required" }} render={({ field, fieldState }) => (
                <OptionSelect table="licenses" column="plan" label="Plan" required value={field.value} onChange={field.onChange} error={fieldState.error?.message} helperText="e.g. Standard, Enterprise. Type a new plan to add it." />
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Seat / user limit" fullWidth inputMode="numeric" helperText={errors.seatLimit?.message ?? "Leave blank for unlimited"} error={Boolean(errors.seatLimit)}
                {...register("seatLimit", { pattern: { value: /^\d*$/, message: "Whole number only" } })} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Start date" type="date" required fullWidth disabled={lockDates} slotProps={{ inputLabel: { shrink: true } }} {...register("startDate", { required: "Start date is required" })} {...f("startDate")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Expiry date" type="date" required fullWidth disabled={lockDates} slotProps={{ inputLabel: { shrink: true } }}
                {...register("expiryDate", { required: "Expiry date is required" })} {...f("expiryDate")}
                helperText={errors.expiryDate?.message ?? (lockDates ? "Use Renew to change the expiry of an issued license" : undefined)} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Renewal</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Renewal price (₹)" fullWidth inputMode="decimal" {...register("renewalPrice", { pattern: { value: /^(\d+(\.\d{1,2})?)?$/, message: "Use a number with up to 2 decimals" } })} {...f("renewalPrice")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Renewal terms" fullWidth placeholder="e.g. Annual, 10% increase" {...register("renewalTerms")} />
            </Grid>
            <Grid size={12}><TextField label="Notes" multiline minRows={3} fullWidth {...register("notes")} /></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Box sx={{ display: "flex", gap: 1, justifyContent: "flex-end" }}>
        <Button onClick={onCancel} disabled={isSubmitting}>Cancel</Button>
        <Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? "Saving…" : licenseId ? "Save changes" : "Issue license"}</Button>
      </Box>
    </Box>
  );
}
