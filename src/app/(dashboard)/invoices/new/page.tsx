import { InvoicesList } from "@/features/invoices/components/InvoicesList";

export default async function Page({ searchParams }: PageProps<"/invoices/new">) {
  const { saleId, clientId } = await searchParams;
  return <InvoicesList openNew newSaleId={typeof saleId === "string" ? saleId : undefined} newClientId={typeof clientId === "string" ? clientId : undefined} />;
}
