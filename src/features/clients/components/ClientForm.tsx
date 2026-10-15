"use client";
import { selectLoading } from "@/components/common/loading";
import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import Autocomplete from "@mui/material/Autocomplete";
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
import { GSTIN_RE, IFSC_RE, PAN_RE, panFromGstin } from "@/lib/validation";
import { ClientDocumentSlots, slotErrors, type DocSlot } from "./ClientDocumentSlots";

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
  brandNames: string[];
  bankName: string;
  bankAccountNo: string;
  bankIfsc: string;
  bankBranch: string;
}

export const EMPTY_CLIENT: ClientFormValues = {
  legalName: "", displayName: "", gstin: "", pan: "", email: "", phone: "", billingAddress: "", shippingAddress: "",
  city: "", stateCode: "", postalCode: "", country: "India", ownerId: "", notes: "",
  brandNames: [], bankName: "", bankAccountNo: "", bankIfsc: "", bankBranch: "",
};


interface Props {
  open: boolean;
  initial?: ClientFormValues;
  /** Documents already stored for this client (edit). */
  initialDocuments?: DocSlot[];
  /** Existing client id when editing. */
  clientId?: string;
  onSaved: (id: string) => void;
  onCancel: () => void;
}

export function ClientForm({ open, initial = EMPTY_CLIENT, initialDocuments, clientId, onSaved, onCancel }: Props) {
  // An existing client with a GSTIN but no PAN gets the PAN filled in when the form opens.
  const { register, handleSubmit, control, setError, setValue, formState: { errors, isSubmitting } } = useForm<ClientFormValues>({
    defaultValues: { ...initial, pan: initial.pan || panFromGstin(initial.gstin) },
  });
  const owners = useFetch<{ items: { id: string; name: string }[] }>("/api/users/options");
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState<{ values: ClientFormValues; names: string[] } | null>(null);
  const [brandInput, setBrandInput] = useState("");
  const [slots, setSlots] = useState<DocSlot[]>(initialDocuments ?? []);
  const [showSlotErrors, setShowSlotErrors] = useState(false);
  // Set once the client exists, so a retry after a failed document upload updates it instead of creating a second one.
  const [savedId, setSavedId] = useState(clientId);

  /** Uploads, renames and removes the document rows. Stops at the first failure and returns the rows as they now stand. */
  async function syncDocuments(id: string, input: DocSlot[]) {
    const out: (DocSlot | null)[] = [...input];
    for (const [i, s] of input.entries()) {
      const meta = { docName: s.docName.trim(), docType: s.docType };
      try {
        if (s.id && s.remove) {
          await api(`/api/clients/${id}/documents/${s.id}`, { method: "DELETE" });
          out[i] = null;
        } else if (s.file) {
          const body = new FormData();
          body.set("file", s.file);
          body.set("docName", meta.docName);
          body.set("docType", meta.docType);
          const { id: newId } = await api<{ id: string }>(`/api/clients/${id}/documents`, { method: "POST", body });
          out[i] = { id: newId, ...meta, fileName: s.file.name, file: null, remove: false, saved: meta };
          // Replacing a file: the old one goes only after the new one is stored.
          if (s.id) await api(`/api/clients/${id}/documents/${s.id}`, { method: "DELETE" });
        } else if (s.id && (s.saved?.docName !== meta.docName || s.saved?.docType !== meta.docType)) {
          await api(`/api/clients/${id}/documents/${s.id}`, { method: "PATCH", body: meta });
          out[i] = { ...s, ...meta, saved: meta };
        }
      } catch (e) {
        return { slots: out.filter((x) => x !== null), error: `"${meta.docName || s.fileName}": ${e instanceof Error ? e.message : "could not be saved"}` };
      }
    }
    return { slots: out.filter((x) => x !== null), error: null };
  }

  async function save(values: ClientFormValues, confirmDuplicate = false) {
    setFormError(null);
    if (slots.some((s) => Object.keys(slotErrors(s)).length > 0)) {
      setShowSlotErrors(true);
      setFormError("Please fix the highlighted fields.");
      return;
    }
    try {
      const body = { ...values, confirmDuplicate };
      let id = savedId;
      if (id) {
        await api(`/api/clients/${id}`, { method: "PATCH", body });
      } else {
        id = (await api<{ id: string }>("/api/clients", { method: "POST", body })).id;
        setSavedId(id);
      }
      const docs = await syncDocuments(id, slots);
      setSlots(docs.slots);
      if (docs.error) {
        setFormError(`The client was saved, but ${docs.error}`);
        return;
      }
      onSaved(id);
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
            <Grid size={12}>
              <Controller
                name="brandNames"
                control={control}
                render={({ field }) => {
                  const add = (names: string[]) => {
                    const seen = new Set(field.value.map((b) => b.toLowerCase()));
                    const fresh = names.map((n) => n.trim()).filter((n) => n && !seen.has(n.toLowerCase()) && seen.add(n.toLowerCase()));
                    if (fresh.length) field.onChange([...field.value, ...fresh]);
                  };
                  return (
                    <Autocomplete
                      multiple
                      freeSolo
                      autoSelect
                      options={[] as string[]}
                      value={field.value}
                      inputValue={brandInput}
                      onChange={(_, v) => field.onChange(v.map((b) => b.trim()).filter(Boolean))}
                      onInputChange={(_, text, reason) => {
                        // A comma ends the name being typed: keep what is before it as a brand and carry on with the rest.
                        if (reason === "input" && text.includes(",")) {
                          const parts = text.split(",");
                          add(parts.slice(0, -1));
                          setBrandInput(parts[parts.length - 1]!.trimStart());
                        } else {
                          setBrandInput(text);
                        }
                      }}
                      renderInput={(params) => (
                        <TextField {...params} label="Brand names" error={Boolean(errors.brandNames)} helperText={(errors.brandNames as { message?: string } | undefined)?.message ?? "Type a brand and press Enter or comma. Add as many as the client sells under"} />
                      )}
                    />
                  );
                }}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              {/* Controlled (not register) so the label always follows the value, including a value filled in by code. */}
              <Controller
                name="gstin"
                control={control}
                rules={{ validate: (v) => !v || GSTIN_RE.test(v.toUpperCase()) || "Enter a valid 15-character GSTIN" }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="GSTIN"
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: 15, style: { textTransform: "uppercase" } } }}
                    onChange={(e) => {
                      const gstin = e.target.value.toUpperCase();
                      field.onChange(gstin);
                      const pan = panFromGstin(gstin);
                      if (pan) setValue("pan", pan, { shouldValidate: true, shouldDirty: true });
                    }}
                    {...f("gstin")}
                  />
                )}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <Controller
                name="pan"
                control={control}
                rules={{ validate: (v) => !v || PAN_RE.test(v.toUpperCase()) || "Enter a valid 10-character PAN" }}
                render={({ field }) => (
                  <TextField
                    {...field}
                    label="PAN"
                    fullWidth
                    slotProps={{ htmlInput: { maxLength: 10, style: { textTransform: "uppercase" } } }}
                    onChange={(e) => field.onChange(e.target.value.toUpperCase())}
                    {...f("pan")}
                    helperText={errors.pan?.message ?? "Filled in from the GSTIN"}
                  />
                )}
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

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Bank details</Typography>
          <Grid container spacing={2}>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Bank name" fullWidth {...register("bankName")} {...f("bankName")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField label="Branch" fullWidth {...register("bankBranch")} {...f("bankBranch")} />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="Account number"
                fullWidth
                slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 40 } }}
                {...register("bankAccountNo", { validate: (v) => !v.trim() || /^[A-Za-z0-9\s-]{6,40}$/.test(v) || "Enter a valid account number" })}
                {...f("bankAccountNo")}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 6 }}>
              <TextField
                label="IFSC"
                fullWidth
                slotProps={{ htmlInput: { maxLength: 11, style: { textTransform: "uppercase" } } }}
                {...register("bankIfsc", { validate: (v) => !v || IFSC_RE.test(v.toUpperCase()) || "Enter a valid 11-character IFSC" })}
                {...f("bankIfsc")}
              />
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 2 }}>Documents</Typography>
          <ClientDocumentSlots slots={slots} onChange={setSlots} showErrors={showSlotErrors} clientId={savedId} />
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
