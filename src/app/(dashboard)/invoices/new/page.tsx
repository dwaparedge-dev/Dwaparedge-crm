import { NewInvoicePage } from "@/features/invoices/components/NewInvoicePage";

export default async function Page({ searchParams }: PageProps<"/invoices/new">) {
  const { saleId, clientId } = await searchParams;
  return <NewInvoicePage saleId={typeof saleId === "string" ? saleId : undefined} clientId={typeof clientId === "string" ? clientId : undefined} />;
}
