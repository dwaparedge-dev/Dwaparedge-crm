"use client";
import { useRouter } from "next/navigation";
import Skeleton from "@mui/material/Skeleton";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import type { LicenseRow } from "../service";
import { LicenseForm, emptyLicense, type LicenseFormValues } from "./LicenseForm";

const toForm = (l: LicenseRow): LicenseFormValues => ({
  clientId: l.client_id, productId: l.product_id, plan: l.plan, startDate: l.start_date, expiryDate: l.expiry_date,
  seatLimit: l.seat_limit ? String(l.seat_limit) : "", renewalPrice: l.renewal_price ?? "", renewalTerms: l.renewal_terms ?? "", notes: l.notes ?? "",
});

export function LicenseFormPage({ licenseId, clientId }: { licenseId?: string; clientId?: string }) {
  const router = useRouter();
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<LicenseRow>(licenseId ? `/api/licenses/${licenseId}` : null);
  const back = licenseId ? `/licenses/${licenseId}` : clientId ? `/clients/${clientId}` : "/licenses";

  return (
    <>
      <PageHeader
        title={licenseId ? "Edit license" : "Issue license"}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Software Licenses", href: "/licenses" }, ...(data ? [{ label: data.license_identifier, href: back }] : []), { label: licenseId ? "Edit" : "New" }]}
      />
      {error ? <ErrorState message={error} onRetry={reload} />
        : licenseId && (loading || !data) ? <Skeleton variant="rounded" height={420} />
        : (
          <LicenseForm
            initial={data ? toForm(data) : emptyLicense(clientId)}
            licenseId={licenseId}
            lockIdentity={Boolean(licenseId)}
            lockDates={Boolean(data && data.stored_status !== "pending")}
            onCancel={() => router.push(back)}
            onSaved={(id) => {
              notify.success(licenseId ? "License updated" : "License issued. Activate it when the client is ready.");
              router.push(`/licenses/${id}`);
              router.refresh();
            }}
          />
        )}
    </>
  );
}
