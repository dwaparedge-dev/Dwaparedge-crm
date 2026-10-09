"use client";
import { useNotify } from "@/components/common/Notify";
import { useFetch } from "@/components/common/useFetch";
import { LoadingDialog } from "@/components/common/LoadingDialog";
import { ClientForm, EMPTY_CLIENT, type ClientFormValues } from "./ClientForm";
import type { ClientRow } from "../service";

const toForm = (c: ClientRow): ClientFormValues => ({
  legalName: c.legal_name, displayName: c.display_name, gstin: c.gstin ?? "", pan: c.pan ?? "", email: c.email ?? "", phone: c.phone ?? "",
  billingAddress: c.billing_address ?? "", shippingAddress: c.shipping_address ?? "", city: c.city ?? "", stateCode: c.state_code ?? "",
  postalCode: c.postal_code ?? "", country: c.country, ownerId: c.owner_id ?? "", notes: c.notes ?? "",
});

/** Add (no clientId) or edit (clientId) a client in a popup. */
export function ClientFormDialog({ clientId, onClose, onSaved }: { clientId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<ClientRow>(clientId ? `/api/clients/${clientId}` : null);
  if (clientId && (loading || !data || error)) return <LoadingDialog error={error} onRetry={reload} onClose={onClose} />;
  return (
    <ClientForm
      open
      initial={data ? toForm(data) : EMPTY_CLIENT}
      clientId={clientId}
      onCancel={onClose}
      onSaved={(id) => { notify.success(clientId ? "Client updated" : "Client created"); onSaved(id); }}
    />
  );
}
