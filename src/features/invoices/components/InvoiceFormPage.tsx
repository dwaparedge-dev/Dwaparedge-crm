"use client";
import { useRouter } from "next/navigation";
import Skeleton from "@mui/material/Skeleton";
import { useNotify } from "@/components/common/Notify";
import { sumAmounts } from "@/lib/money";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
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

export function InvoiceFormPage({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const notify = useNotify();
  const inv = useFetch<Detail>(`/api/invoices/${invoiceId}`);
  const sale = useFetch<SaleDetail>(inv.data ? `/api/sales/${inv.data.sale_id}` : null);
  const back = `/invoices/${invoiceId}`;
  const error = inv.error ?? sale.error;

  const ownTaxable: Record<string, string> = {};
  for (const l of inv.data?.items ?? []) ownTaxable[l.sale_item_id] = sumAmounts([ownTaxable[l.sale_item_id] ?? "0", l.taxable_amount]);

  return (
    <>
      <PageHeader title="Edit draft invoice" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Invoices", href: "/invoices" }, { label: "Edit draft" }]} />
      {error ? <ErrorState message={error} onRetry={() => { inv.reload(); sale.reload(); }} />
        : !inv.data || !sale.data ? <Skeleton variant="rounded" height={420} />
        : inv.data.status !== "draft" ? <ErrorState message="Only draft invoices can be edited." />
        : (
          <InvoiceForm
            initial={toForm(inv.data)}
            invoiceId={invoiceId}
            saleNumber={sale.data.sale_number}
            saleItems={sale.data.items}
            ownTaxable={ownTaxable}
            onCancel={() => router.push(back)}
            onSaved={(id) => { notify.success("Draft saved"); router.push(`/invoices/${id}`); router.refresh(); }}
          />
        )}
    </>
  );
}
