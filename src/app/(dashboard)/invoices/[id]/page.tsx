import { InvoiceDetail } from "@/features/invoices/components/InvoiceDetail";

export default async function Page({ params }: PageProps<"/invoices/[id]">) {
  const { id } = await params;
  return <InvoiceDetail id={id} />;
}
