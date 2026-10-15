"use client";
import { useNotify } from "@/components/common/Notify";
import { useFetch } from "@/components/common/useFetch";
import { LoadingDialog } from "@/components/common/LoadingDialog";
import { ClientForm, EMPTY_CLIENT, type ClientFormValues } from "./ClientForm";
import { slotsFromDocuments } from "./ClientDocumentSlots";
import type { ClientDocumentRow } from "../documents";
import type { ClientRow } from "../service";

const toForm = (c: ClientRow): ClientFormValues => ({
  legalName: c.legal_name, displayName: c.display_name, gstin: c.gstin ?? "", pan: c.pan ?? "", email: c.email ?? "", phone: c.phone ?? "",
  billingAddress: c.billing_address ?? "", shippingAddress: c.shipping_address ?? "", city: c.city ?? "", stateCode: c.state_code ?? "",
  postalCode: c.postal_code ?? "", country: c.country, ownerId: c.owner_id ?? "", notes: c.notes ?? "",
  brandNames: (c.brand_names ?? "").split(",").map((b) => b.trim()).filter(Boolean), bankName: c.bank_name ?? "", bankAccountNo: c.bank_account_no ?? "", bankIfsc: c.bank_ifsc ?? "", bankBranch: c.bank_branch ?? "",
});

/** Add (no clientId) or edit (clientId) a client in a popup. */
export function ClientFormDialog({ clientId, onClose, onSaved }: { clientId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const notify = useNotify();
  const client = useFetch<ClientRow>(clientId ? `/api/clients/${clientId}` : null);
  const docs = useFetch<{ items: ClientDocumentRow[] }>(clientId ? `/api/clients/${clientId}/documents` : null);
  const { data } = client;
  if (clientId && (client.loading || docs.loading || !data || !docs.data || client.error || docs.error)) {
    return <LoadingDialog error={client.error ?? docs.error} onRetry={() => { client.reload(); docs.reload(); }} onClose={onClose} />;
  }
  return (
    <ClientForm
      open
      initial={data ? toForm(data) : EMPTY_CLIENT}
      initialDocuments={docs.data ? slotsFromDocuments(docs.data.items) : undefined}
      clientId={clientId}
      onCancel={onClose}
      onSaved={(id) => { notify.success(clientId ? "Client updated" : "Client created"); onSaved(id); }}
    />
  );
}
