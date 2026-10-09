"use client";
import { useNotify } from "@/components/common/Notify";
import { useFetch } from "@/components/common/useFetch";
import { LoadingDialog } from "@/components/common/LoadingDialog";
import type { LicenseRow } from "../service";
import { LicenseForm, emptyLicense, type LicenseFormValues } from "./LicenseForm";

const toForm = (l: LicenseRow): LicenseFormValues => ({
  clientId: l.client_id, productId: l.product_id, plan: l.plan, startDate: l.start_date, expiryDate: l.expiry_date,
  seatLimit: l.seat_limit ? String(l.seat_limit) : "", renewalPrice: l.renewal_price ?? "", renewalTerms: l.renewal_terms ?? "", notes: l.notes ?? "",
});

/** Issue (no licenseId) or edit (licenseId) a license in a popup. `clientId` pre-selects the client when issuing. */
export function LicenseFormDialog({ licenseId, clientId, onClose, onSaved }: { licenseId?: string; clientId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<LicenseRow>(licenseId ? `/api/licenses/${licenseId}` : null);
  if (licenseId && (loading || !data || error)) return <LoadingDialog error={error} onRetry={reload} onClose={onClose} />;
  return (
    <LicenseForm
      open
      initial={data ? toForm(data) : emptyLicense(clientId)}
      licenseId={licenseId}
      lockIdentity={Boolean(licenseId)}
      lockDates={Boolean(data && data.stored_status !== "pending")}
      onCancel={onClose}
      onSaved={(id) => { notify.success(licenseId ? "License updated" : "License issued. Activate it when the client is ready."); onSaved(id); }}
    />
  );
}
