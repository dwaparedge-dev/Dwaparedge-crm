"use client";
import { useRouter } from "next/navigation";
import Skeleton from "@mui/material/Skeleton";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import type { CompanySettings } from "@/features/settings/service";
import type { InvoiceItemRow, InvoiceRow } from "../service";
import { InvoiceForm, emptyInvoice, type InvoiceFormValues } from "./InvoiceForm";

type Detail = InvoiceRow & { items: InvoiceItemRow[] };

const toForm = (i: Detail): InvoiceFormValues => ({
  clientId: i.client_id, invoiceType: i.invoice_type, issueDate: i.issue_date, dueDate: i.due_date, placeOfSupplyStateCode: i.place_of_supply_state_code ?? "",
  paymentTerms: i.payment_terms ?? "", notes: i.notes ?? "",
  items: i.items.map((x) => ({
    productId: x.product_id ?? "", description: x.description, hsnSac: x.hsn_sac ?? "", quantity: String(Number(x.quantity)), unitPrice: x.unit_price,
    discountPercent: String(Number(x.discount_percent)), taxRate: String(Number(x.tax_rate)),
  })),
});

export function InvoiceFormPage({ invoiceId, clientId }: { invoiceId?: string; clientId?: string }) {
  const router = useRouter();
  const notify = useNotify();
  const inv = useFetch<Detail>(invoiceId ? `/api/invoices/${invoiceId}` : null);
  const settings = useFetch<CompanySettings>("/api/settings");
  const back = invoiceId ? `/invoices/${invoiceId}` : clientId ? `/clients/${clientId}` : "/invoices";
  const error = inv.error ?? settings.error;
  const ready = (!invoiceId || inv.data) && settings.data;

  return (
    <>
      <PageHeader title={invoiceId ? "Edit draft invoice" : "New invoice"} crumbs={[{ label: "Dashboard", href: "/" }, { label: "Invoices", href: "/invoices" }, { label: invoiceId ? "Edit draft" : "New" }]} />
      {error ? <ErrorState message={error} onRetry={() => { inv.reload(); settings.reload(); }} />
        : !ready ? <Skeleton variant="rounded" height={420} />
        : inv.data && inv.data.status !== "draft" ? <ErrorState message="Only draft invoices can be edited." />
        : (
          <InvoiceForm
            initial={inv.data ? toForm(inv.data) : emptyInvoice(clientId, settings.data!.default_due_days, settings.data!.default_payment_terms ?? "", settings.data!.default_invoice_notes ?? "")}
            invoiceId={invoiceId}
            onCancel={() => router.push(back)}
            onSaved={(id) => {
              notify.success("Draft saved");
              router.push(`/invoices/${id}`);
              router.refresh();
            }}
          />
        )}
    </>
  );
}
