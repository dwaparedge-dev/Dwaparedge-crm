"use client";
import { useNotify } from "@/components/common/Notify";
import { useFetch } from "@/components/common/useFetch";
import { LoadingDialog } from "@/components/common/LoadingDialog";
import { sumAmounts } from "@/lib/money";
import type { MilestoneRow, SaleItemRow, SaleRow } from "@/features/sales/service";
import type { InvoiceItemRow, InvoiceRow } from "../service";
import { InvoiceForm, type InvoiceFormValues } from "./InvoiceForm";

type Detail = InvoiceRow & { items: InvoiceItemRow[] };
type SaleDetail = SaleRow & { items: SaleItemRow[]; milestones: MilestoneRow[] };

const toForm = (i: Detail): InvoiceFormValues => ({
  saleId: i.sale_id, issueDate: i.issue_date, dueDate: i.due_date, placeOfSupplyStateCode: i.place_of_supply_state_code ?? "",
  paymentTerms: i.payment_terms ?? "", notes: i.notes ?? "",
  items: i.items.map((x) => ({
    saleItemId: x.sale_item_id, productId: x.product_id ?? "", description: x.description, hsnSac: x.hsn_sac ?? "", quantity: String(Number(x.quantity)), unitPrice: x.unit_price,
    discountPercent: String(Number(x.discount_percent)), taxRate: String(Number(x.tax_rate)),
  })),
});

/** Edit a draft invoice in a popup. */
export function InvoiceFormDialog({ invoiceId, onClose, onSaved }: { invoiceId: string; onClose: () => void; onSaved: () => void }) {
  const notify = useNotify();
  const inv = useFetch<Detail>(`/api/invoices/${invoiceId}`);
  const sale = useFetch<SaleDetail>(inv.data ? `/api/sales/${inv.data.sale_id}` : null);
  const error = inv.error ?? sale.error ?? (inv.data && inv.data.status !== "draft" ? "Only draft invoices can be edited." : null);
  if (error || !inv.data || !sale.data) return <LoadingDialog error={error} onRetry={() => { inv.reload(); sale.reload(); }} onClose={onClose} />;

  const ownTaxable: Record<string, string> = {};
  for (const l of inv.data.items) ownTaxable[l.sale_item_id] = sumAmounts([ownTaxable[l.sale_item_id] ?? "0", l.taxable_amount]);
  return (
    <InvoiceForm
      open
      initial={toForm(inv.data)}
      invoiceId={invoiceId}
      saleNumber={sale.data.sale_number}
      saleItems={sale.data.items}
      ownTaxable={ownTaxable}
      onCancel={onClose}
      onSaved={() => { notify.success("Draft saved"); onSaved(); }}
    />
  );
}
