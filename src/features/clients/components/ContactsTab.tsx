"use client";
import { useState } from "react";
import { useForm } from "react-hook-form";
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
import IconButton from "@mui/material/IconButton";
import Table from "@mui/material/Table";
import TableBody from "@mui/material/TableBody";
import TableCell from "@mui/material/TableCell";
import TableContainer from "@mui/material/TableContainer";
import TableHead from "@mui/material/TableHead";
import TableRow from "@mui/material/TableRow";
import TextField from "@mui/material/TextField";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import type { ContactRow } from "@/features/contacts/service";

interface FormValues {
  name: string;
  designation: string;
  email: string;
  phone: string;
  notes: string;
  isPrimary: boolean;
}
const EMPTY: FormValues = { name: "", designation: "", email: "", phone: "", notes: "", isPrimary: false };

function ContactDialog({ clientId, contact, open, onClose, onSaved }: {
  clientId: string; contact: ContactRow | null; open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const notify = useNotify();
  const { register, handleSubmit, setError, formState: { errors, isSubmitting } } = useForm<FormValues>({
    defaultValues: contact
      ? { name: contact.name, designation: contact.designation ?? "", email: contact.email ?? "", phone: contact.phone ?? "", notes: contact.notes ?? "", isPrimary: contact.is_primary }
      : EMPTY,
  });
  const [formError, setFormError] = useState<string | null>(null);

  async function submit(values: FormValues) {
    setFormError(null);
    try {
      if (contact) await api(`/api/clients/${clientId}/contacts/${contact.id}`, { method: "PATCH", body: values });
      else await api(`/api/clients/${clientId}/contacts`, { method: "POST", body: values });
      notify.success(contact ? "Contact updated" : "Contact added");
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.details?.issues?.length) {
        for (const i of e.details.issues) {
          const f = String(i.path[0] ?? "");
          if (f in EMPTY) setError(f as keyof FormValues, { message: i.message });
        }
      }
      setFormError(e instanceof Error ? e.message : "Could not save contact");
    }
  }

  return (
    <Dialog open={open} onClose={isSubmitting ? undefined : onClose} maxWidth="sm" fullWidth>
      <Box component="form" noValidate onSubmit={handleSubmit(submit)}>
        <DialogTitle>{contact ? "Edit contact" : "Add contact"}</DialogTitle>
        <DialogContent sx={{ display: "grid", gap: 2, pt: "8px !important" }}>
          {formError && <Alert severity="error">{formError}</Alert>}
          <TextField label="Name" required autoFocus {...register("name", { required: "Name is required" })} error={Boolean(errors.name)} helperText={errors.name?.message} />
          <TextField label="Designation" {...register("designation")} />
          <TextField label="Email" type="email" {...register("email")} error={Boolean(errors.email)} helperText={errors.email?.message} />
          <TextField label="Phone" {...register("phone")} error={Boolean(errors.phone)} helperText={errors.phone?.message} />
          <TextField label="Notes" multiline minRows={2} {...register("notes")} />
          <FormControlLabel control={<Checkbox {...register("isPrimary")} defaultChecked={contact?.is_primary ?? false} />} label="Primary contact" />
        </DialogContent>
        <DialogActions>
          <Button onClick={onClose} disabled={isSubmitting}>Cancel</Button>
          <Button type="submit" variant="contained" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save"}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export function ContactsTab({ clientId, readOnly }: { clientId: string; readOnly: boolean }) {
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<{ items: ContactRow[] }>(`/api/clients/${clientId}/contacts`);
  const [editing, setEditing] = useState<ContactRow | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogKey, setDialogKey] = useState(0);
  const [toDelete, setToDelete] = useState<ContactRow | null>(null);
  const [busy, setBusy] = useState(false);

  const openDialog = (c: ContactRow | null) => {
    setEditing(c);
    setDialogKey((k) => k + 1);
    setDialogOpen(true);
  };

  async function remove() {
    if (!toDelete) return;
    setBusy(true);
    try {
      await api(`/api/clients/${clientId}/contacts/${toDelete.id}`, { method: "DELETE" });
      notify.success("Contact removed");
      setToDelete(null);
      reload();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not remove contact");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <TableSkeleton rows={3} cols={4} />;

  return (
    <>
      {!readOnly && (
        <Box sx={{ display: "flex", justifyContent: "flex-end", mb: 2 }}>
          <Button variant="contained" startIcon={<AddIcon />} onClick={() => openDialog(null)}>Add contact</Button>
        </Box>
      )}
      {data && data.items.length === 0 ? (
        <EmptyState title="No contacts yet" hint="Add the people you work with at this company." />
      ) : (
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Designation</TableCell>
                <TableCell>Email</TableCell>
                <TableCell>Phone</TableCell>
                {!readOnly && <TableCell align="right">Actions</TableCell>}
              </TableRow>
            </TableHead>
            <TableBody>
              {data?.items.map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    {c.name} {c.is_primary && <Chip size="small" color="primary" label="Primary" sx={{ ml: 0.5 }} />}
                  </TableCell>
                  <TableCell>{c.designation ?? "—"}</TableCell>
                  <TableCell>{c.email ?? "—"}</TableCell>
                  <TableCell>{c.phone ?? "—"}</TableCell>
                  {!readOnly && (
                    <TableCell align="right">
                      <IconButton aria-label={`Edit ${c.name}`} onClick={() => openDialog(c)}><EditIcon fontSize="small" /></IconButton>
                      <IconButton aria-label={`Remove ${c.name}`} onClick={() => setToDelete(c)}><DeleteIcon fontSize="small" /></IconButton>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <ContactDialog
        key={dialogKey}
        clientId={clientId}
        contact={editing}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={() => { setDialogOpen(false); reload(); }}
      />
      <ConfirmDialog
        open={toDelete !== null}
        title="Remove contact?"
        message={<>Remove <strong>{toDelete?.name}</strong> from this client? This cannot be undone.</>}
        confirmLabel="Remove"
        destructive
        busy={busy}
        onConfirm={remove}
        onClose={() => setToDelete(null)}
      />
    </>
  );
}
