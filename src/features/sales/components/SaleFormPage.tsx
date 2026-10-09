"use client";
import { useRouter } from "next/navigation";
import Skeleton from "@mui/material/Skeleton";
import { PageHeader } from "@/components/common/PageHeader";
import { useNotify } from "@/components/common/Notify";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import type { SaleItemRow, SaleRow } from "../service";
import { SaleForm, emptySale, type SaleFormValues } from "./SaleForm";

type SaleDetail = SaleRow & { items: SaleItemRow[] };

const toForm = (s: SaleDetail): SaleFormValues => ({
  clientId: s.client_id, type: s.type, title: s.title, ownerId: s.owner_id ?? "", saleDate: s.sale_date, expectedClose: s.expected_close ?? "", notes: s.notes ?? "",
  items: s.items.map((i) => ({
    productId: i.product_id ?? "", description: i.description, hsnSac: i.hsn_sac ?? "", quantity: String(Number(i.quantity)),
    unitPrice: i.unit_price, discountPercent: String(Number(i.discount_percent)), taxRate: String(Number(i.tax_rate)),
  })),
});

export function SaleFormPage({ saleId, clientId }: { saleId?: string; clientId?: string }) {
  const router = useRouter();
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<SaleDetail>(saleId ? `/api/sales/${saleId}` : null);
  const back = saleId ? `/sales/${saleId}` : clientId ? `/clients/${clientId}` : "/sales";

  return (
    <>
      <PageHeader
        title={saleId ? `Edit sale ${data?.sale_number ?? ""}` : "Add sale"}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Sales", href: "/sales" }, ...(saleId && data ? [{ label: data.sale_number, href: back }] : []), { label: saleId ? "Edit" : "New" }]}
      />
      {error ? <ErrorState message={error} onRetry={reload} />
        : saleId && (loading || !data) ? <Skeleton variant="rounded" height={420} />
        : (
          <SaleForm
            initial={data ? toForm(data) : emptySale(clientId)}
            saleId={saleId}
            lockClient={Boolean(saleId)}
            onCancel={() => router.push(back)}
            onSaved={(id) => {
              notify.success(saleId ? "Sale updated" : "Sale created");
              router.push(`/sales/${id}`);
              router.refresh();
            }}
          />
        )}
    </>
  );
}
