"use client";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Checkbox from "@mui/material/Checkbox";
import FormControlLabel from "@mui/material/FormControlLabel";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import { INDIAN_STATES } from "@/lib/india";
import { OptionsManager } from "@/features/options/components/OptionsManager";
import type { CompanySettings } from "../service";

interface Values {
  legalName: string; tradeName: string; address: string; city: string; stateCode: string; postalCode: string; gstin: string; pan: string;
  email: string; phone: string; website: string; bankAccountName: string; bankName: string; bankAccountNumber: string; bankIfsc: string; bankBranch: string;
  upiId: string; invoicePrefix: string; receiptPrefix: string; defaultDueDays: string; defaultPaymentTerms: string; defaultInvoiceNotes: string;
  signatoryName: string; roundOffTotal: boolean;
}

const toValues = (s: CompanySettings): Values => ({
  legalName: s.legal_name, tradeName: s.trade_name ?? "", address: s.address, city: s.city ?? "", stateCode: s.state_code ?? "", postalCode: s.postal_code ?? "",
  gstin: s.gstin ?? "", pan: s.pan ?? "", email: s.email ?? "", phone: s.phone ?? "", website: s.website ?? "", bankAccountName: s.bank_account_name ?? "",
  bankName: s.bank_name ?? "", bankAccountNumber: s.bank_account_number ?? "", bankIfsc: s.bank_ifsc ?? "", bankBranch: s.bank_branch ?? "", upiId: s.upi_id ?? "",
  invoicePrefix: s.invoice_prefix, receiptPrefix: s.receipt_prefix, defaultDueDays: String(s.default_due_days), defaultPaymentTerms: s.default_payment_terms ?? "",
  defaultInvoiceNotes: s.default_invoice_notes ?? "", signatoryName: s.signatory_name ?? "", roundOffTotal: s.round_off_total,
});

function SettingsForm({ initial, onSaved }: { initial: Values; onSaved: () => void }) {
  const notify = useNotify();
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting, isDirty } } = useForm<Values>({ defaultValues: initial });
  const [formError, setFormError] = useState<string | null>(null);
  const f = (n: keyof Values) => ({ error: Boolean(errors[n]), helperText: errors[n]?.message as string | undefined });

  async function submit(v: Values) {
    setFormError(null);
    try {
      await api("/api/settings", { method: "PUT", body: v });
      notify.success("Settings saved");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        for (const i of e.details.issues) setError(String(i.path[0]) as keyof Values, { message: i.message });
        setFormError("Please fix the highlighted fields.");
        return;
      }
      setFormError(e instanceof Error ? e.message : "Could not save settings");
    }
  }

  return (
    <Box component="form" noValidate onSubmit={handleSubmit(submit)}>
      {formError && <Alert severity="error" sx={{ mb: 2 }}>{formError}</Alert>}
      <Alert severity="info" sx={{ mb: 2 }}>These details are printed on invoices. Each invoice keeps a copy of them at the time it is issued, so changing them here never alters invoices already issued.</Alert>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Company</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Legal name" required fullWidth {...register("legalName", { required: "Required" })} {...f("legalName")} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Trade name (shown as the heading, optional)" fullWidth {...register("tradeName")} {...f("tradeName")} /></Grid>
            <Grid size={12}><TextField label="Address" required multiline minRows={2} fullWidth {...register("address", { required: "Required" })} {...f("address")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="City" fullWidth {...register("city")} {...f("city")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <Controller name="stateCode" control={control} rules={{ required: "Select your state" }} render={({ field }) => (
                <TextField select label="State" required fullWidth {...field} {...f("stateCode")} helperText={errors.stateCode?.message ?? "Decides CGST+SGST (same state) or IGST (other states)"}>
                  {INDIAN_STATES.map((s) => <MenuItem key={s.code} value={s.code}>{s.name} ({s.code})</MenuItem>)}
                </TextField>
              )} />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Postal code" fullWidth {...register("postalCode")} {...f("postalCode")} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="GSTIN" fullWidth slotProps={{ htmlInput: { maxLength: 15 } }} {...register("gstin")} {...f("gstin")} helperText={errors.gstin?.message ?? "Leave blank if unregistered: the document is then titled “Invoice”, not “Tax Invoice”"} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="PAN" fullWidth slotProps={{ htmlInput: { maxLength: 10 } }} {...register("pan")} {...f("pan")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Email" fullWidth {...register("email")} {...f("email")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Phone" fullWidth {...register("phone")} {...f("phone")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Website" fullWidth {...register("website")} {...f("website")} /></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Bank details (printed on invoices)</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Account name" fullWidth {...register("bankAccountName")} {...f("bankAccountName")} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="Bank name" fullWidth {...register("bankName")} {...f("bankName")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Account number" fullWidth {...register("bankAccountNumber")} {...f("bankAccountNumber")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="IFSC" fullWidth {...register("bankIfsc")} {...f("bankIfsc")} /></Grid>
            <Grid size={{ xs: 12, md: 4 }}><TextField label="Branch" fullWidth {...register("bankBranch")} {...f("bankBranch")} /></Grid>
            <Grid size={{ xs: 12, md: 6 }}><TextField label="UPI ID" fullWidth {...register("upiId")} {...f("upiId")} /></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Invoice defaults</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 3 }}><TextField label="Invoice number prefix" fullWidth {...register("invoicePrefix", { required: "Required" })} {...f("invoicePrefix")} helperText={errors.invoicePrefix?.message ?? "e.g. DE → DE/2026-27/0001. Numbers restart every April."} /></Grid>
            <Grid size={{ xs: 12, md: 3 }}><TextField label="Receipt number prefix" fullWidth {...register("receiptPrefix", { required: "Required" })} {...f("receiptPrefix")} /></Grid>
            <Grid size={{ xs: 12, md: 3 }}><TextField label="Default due (days)" fullWidth inputMode="numeric" {...register("defaultDueDays", { required: "Required", pattern: { value: /^\d+$/, message: "Whole number" } })} {...f("defaultDueDays")} /></Grid>
            <Grid size={{ xs: 12, md: 3 }}><TextField label="Authorised signatory" fullWidth {...register("signatoryName")} {...f("signatoryName")} /></Grid>
            <Grid size={12}><TextField label="Default payment terms" multiline minRows={2} fullWidth {...register("defaultPaymentTerms")} {...f("defaultPaymentTerms")} /></Grid>
            <Grid size={12}><TextField label="Default invoice notes" multiline minRows={2} fullWidth {...register("defaultInvoiceNotes")} {...f("defaultInvoiceNotes")} /></Grid>
            <Grid size={12}><FormControlLabel control={<Checkbox {...register("roundOffTotal")} defaultChecked={initial.roundOffTotal} />} label="Round the invoice total to the nearest rupee (shown as a separate “Round off” line)" /></Grid>
          </Grid>
        </CardContent>
      </Card>
      <Box sx={{ display: "flex", justifyContent: "flex-end" }}>
        <Button type="submit" variant="contained" disabled={isSubmitting || !isDirty}>{isSubmitting ? "Saving…" : "Save settings"}</Button>
      </Box>
    </Box>
  );
}

export function SettingsPage() {
  const { data, error, loading, reload } = useFetch<CompanySettings>("/api/settings");
  const [tab, setTab] = useState(0);
  return (
    <>
      <PageHeader title="Settings" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Settings" }]} />
      <Tabs value={tab} onChange={(_, v: number) => setTab(v)} sx={{ mb: 2 }}>
        <Tab label="Company & invoices" />
        <Tab label="Dropdown options" />
      </Tabs>
      {tab === 1 ? <OptionsManager /> : error ? <ErrorState message={error} onRetry={reload} /> : loading || !data ? <Skeleton variant="rounded" height={420} /> : <SettingsForm key={data.updated_at} initial={toValues(data)} onSaved={reload} />}
    </>
  );
}
