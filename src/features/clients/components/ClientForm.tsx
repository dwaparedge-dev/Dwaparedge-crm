"use client";
import { selectLoading } from "@/components/common/loading";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { FormShell } from "@/components/common/FormShell";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import { INDIAN_STATES } from "@/lib/india";
import { GSTIN_RE, PAN_RE } from "@/lib/validation";

export interface ClientFormValues {
  legalName: string;
  displayName: string;
  gstin: string;
  pan: string;
  email: string;
  phone: string;
  billingAddress: string;
  shippingAddress: string;
  city: string;
  stateCode: string;
  postalCode: string;
  country: string;
  ownerId: string;
  notes: string;
}

export const EMPTY_CLIENT: ClientFormValues = {
  legalName: "", displayName: "", gstin: "", pan: "", email: "", phone: "", billingAddress: "", shippingAddress: "",
  city: "", stateCode: "", postalCode: "", country: "India", ownerId: "", notes: "",
};

interface Props {
  open: boolean;
  initial?: ClientFormValues;
  /** Existing client id when editing. */
  clientId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export function ClientForm({ open, initial = EMPTY_CLIENT, clientId, onSaved, onCancel }: Props) {
  const { register, handleSubmit, control, setError, formState: { errors, isSubmitting } } = useForm<ClientFormValues>({ defaultValues: initial });
  const owners = useFetch<{ items: { id: string; name: string }[] }>("/api/users/options");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ values: ClientFormValues; names: string[] } | null>(null);

  async function save(values: ClientFormValues, confirmDuplicate = false) {
    setFormError(null);
    try {
      const body = { ...values, confirmDuplicate };
      if (clientId) {
        await api(`/api/clients/${clientId}`, { method: "PATCH", body });
        onSaved(clientId);
      } else {
        const { id } = await api<{ id: string }>("/api/clients", { method: "POST", body });
        onSaved(id);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "POSSIBLE_DUPLICATE") {
          setPending({ values, names: (e.details?.duplicates ?? []).map((d) => d.legalName + (d.archived ? " (archived)" : "")) });
          return;
        }
        if (e.code === "VALIDATION_ERROR" && e.details?.issues?.length) {
          for (const issue of e.details.issues) {
            const field = String(issue.path[0] ?? "");
            if (field in EMPTY_CLIENT) setError(field as keyof ClientFormValues, { message: issue.message });
          }
          setFormError("Please fix the highlighted fields.");
          return;
        }
        setFormError(e.message);
        return;
      }
      setFormError("Something went wrong. Please try again.");
    }
  }

  const f = (name: keyof ClientFormValues) => ({ error: Boolean(errors[name]), helperText: errors[name]?.message as string | undefined });

  return (
    <FormShell open={open} title={clientId ? "Edit client" : "Add client"} onClose={onCancel} onSubmit={handleSubmit((v) => save(v))}
      submitting={isSubmitting} submitLabel={clientId ? "Save changes" : "Create client"} error={formError}>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Business details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Legal name" required fullWidth {...register("legalName", { required: "Legal name is required" })} {...f("legalName")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Display name" fullWidth {...register("displayName")} {...f("displayName")} helperText={errors.displayName?.message ?? "Defaults to the legal name"} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="GSTIN"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 15, style: { textTransform: "uppercase" } } }}
                {...register("gstin", { validate: (v) => !v || GSTIN_RE.test(v.toUpperCase()) || "Enter a valid 15-character GSTIN" })}
                {...f("gstin")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="PAN"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 10, style: { textTransform: "uppercase" } } }}
                {...register("pan", { validate: (v) => !v || PAN_RE.test(v.toUpperCase()) || "Enter a valid 10-character PAN" })}
                {...f("pan")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Primary email" type="email" fullWidth {...register("email")} {...f("email")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Phone" fullWidth {...register("phone")} {...f("phone")} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Address</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Billing address" multiline minRows={3} fullWidth {...register("billingAddress")} {...f("billingAddress")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Shipping address" multiline minRows={3} fullWidth {...register("shippingAddress")} {...f("shippingAddress")} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField label="City" fullWidth {...register("city")} {...f("city")} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <Controller
                name="stateCode"
                control={control}
                render={({ field }) => (
                  <TextField select label="State" fullWidth {...field} {...f("stateCode")} helperText={errors.stateCode?.message ?? "Used to choose CGST/SGST or IGST"}>
                    <MenuItem value="">
                      <em>Not set</em>
                    </MenuItem>
                    {INDIAN_STATES.map((s) => (
                      <MenuItem key={s.code} value={s.code}>
                        {s.name} ({s.code})
                      </MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField label="Postal code" fullWidth {...register("postalCode")} {...f("postalCode")} />
            </Grid>
            <Grid size={{ xs: 12, md: 3 }}>
              <TextField label="Country" fullWidth {...register("country")} {...f("country")} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Account</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="ownerId"
                control={control}
                render={({ field }) => (
                  <TextField select label="Account owner" fullWidth {...field} disabled={owners.loading} slotProps={selectLoading(owners.loading)}>
                    <MenuItem value="">
                      <em>Unassigned</em>
                    </MenuItem>
                    {owners.data?.items.map((u) => (
                      <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>
                    ))}
                  </TextField>
                )}
              />
            </Grid>
            <Grid size={12}>
              <TextField label="Internal notes" multiline minRows={3} fullWidth {...register("notes")} {...f("notes")} />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={pending !== null}
        title="Possible duplicate"
        message={
          <>
            A client with the same name or email already exists: <strong>{pending?.names.join(", ")}</strong>. Save anyway?
          </>
        }
        confirmLabel="Save anyway"
        onClose={() => setPending(null)}
        onConfirm={() => {
          const v = pending!.values;
          setPending(null);
          void save(v, true);
        }}
      />
    </FormShell>
  );
}
