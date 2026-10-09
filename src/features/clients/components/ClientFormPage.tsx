"use client";
import { useRouter } from "next/navigation";
import { PageHeader } from "@/components/common/PageHeader";
import { useNotify } from "@/components/common/Notify";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import Skeleton from "@mui/material/Skeleton";
import { ClientForm, EMPTY_CLIENT, type ClientFormValues } from "./ClientForm";
import type { ClientRow } from "../service";

const toForm = (c: ClientRow): ClientFormValues => ({
  legalName: c.legal_name, displayName: c.display_name, gstin: c.gstin ?? "", pan: c.pan ?? "", email: c.email ?? "", phone: c.phone ?? "",
  billingAddress: c.billing_address ?? "", shippingAddress: c.shipping_address ?? "", city: c.city ?? "", stateCode: c.state_code ?? "",
  postalCode: c.postal_code ?? "", country: c.country, ownerId: c.owner_id ?? "", notes: c.notes ?? "",
});

export function ClientFormPage({ clientId }: { clientId?: string }) {
  const router = useRouter();
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<ClientRow>(clientId ? `/api/clients/${clientId}` : null);

  const back = clientId ? `/clients/${clientId}` : "/clients";
  const crumbs = [
    { label: "Dashboard", href: "/" },
    { label: "Clients", href: "/clients" },
    ...(clientId && data ? [{ label: data.display_name, href: back }] : []),
    { label: clientId ? "Edit" : "New client" },
  ];

  return (
    <>
      <PageHeader title={clientId ? "Edit client" : "Add client"} crumbs={crumbs} />
      {error ? (
        <ErrorState message={error} onRetry={reload} />
      ) : clientId && (loading || !data) ? (
        <Skeleton variant="rounded" height={420} />
      ) : (
        <ClientForm
          initial={data ? toForm(data) : EMPTY_CLIENT}
          clientId={clientId}
          onCancel={() => router.push(back)}
          onSaved={(id) => {
            notify.success(clientId ? "Client updated" : "Client created");
            router.push(`/clients/${id}`);
            router.refresh();
          }}
        />
      )}
    </>
  );
}
