"use client";
import { useNotify } from "@/components/common/Notify";
import { useFetch } from "@/components/common/useFetch";
import { LoadingDialog } from "@/components/common/LoadingDialog";
import type { SaleItemRow, SaleRow } from "../service";
import { SaleForm, emptySale, type SaleFormValues } from "./SaleForm";

type SaleDetail = SaleRow & { items: SaleItemRow[] };

const toForm = (s: SaleDetail): SaleFormValues => ({
  clientId: s.client_id, type: s.type, title: s.title, ownerId: s.owner_id ?? "", saleDate: s.sale_date, expectedClose: s.expected_close ?? "", notes: s.notes ?? "",
  items: s.items.map((i) => ({
    itemId: i.id,
    billed: String(Number(i.issued_taxable) + Number(i.draft_taxable)),
    productId: i.product_id ?? "", description: i.description, hsnSac: i.hsn_sac ?? "", quantity: String(Number(i.quantity)),
    unitPrice: i.unit_price, discountPercent: String(Number(i.discount_percent)), taxRate: String(Number(i.tax_rate)),
  })),
});

/** Add (no saleId) or edit (saleId) a sale in a popup. `clientId` pre-selects the client when adding. */
export function SaleFormDialog({ saleId, clientId, onClose, onSaved }: { saleId?: string; clientId?: string; onClose: () => void; onSaved: (id: string) => void }) {
  const notify = useNotify();
  const { data, error, loading, reload } = useFetch<SaleDetail>(saleId ? `/api/sales/${saleId}` : null);
  if (saleId && (loading || !data || error)) return <LoadingDialog error={error} onRetry={reload} onClose={onClose} />;
  return (
    <SaleForm
      open
      initial={data ? toForm(data) : emptySale(clientId)}
      saleId={saleId}
      lockClient={Boolean(saleId) || Boolean(clientId)}
      onCancel={onClose}
      onSaved={(id) => { notify.success(saleId ? "Sale updated" : "Sale created"); onSaved(id); }}
    />
  );
}
