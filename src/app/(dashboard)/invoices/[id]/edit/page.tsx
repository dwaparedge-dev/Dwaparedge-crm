import { InvoiceFormPage } from "@/features/invoices/components/InvoiceFormPage";

export default async function Page({ params }: PageProps<"/invoices/[id]/edit">) {
  const { id } = await params;
  return <InvoiceFormPage invoiceId={id} />;
}
