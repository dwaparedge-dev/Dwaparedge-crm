import { SaleFormPage } from "@/features/sales/components/SaleFormPage";

export default async function Page({ searchParams }: PageProps<"/sales/new">) {
  const { clientId } = await searchParams;
  return <SaleFormPage clientId={typeof clientId === "string" ? clientId : undefined} />;
}
