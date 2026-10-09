import { InvoiceFormPage } from "@/features/invoices/components/InvoiceFormPage";

export default async function Page({ searchParams }: PageProps<"/invoices/new">) {
  const { clientId } = await searchParams;
  return <InvoiceFormPage clientId={typeof clientId === "string" ? clientId : undefined} />;
}
