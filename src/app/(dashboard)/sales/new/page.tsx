import { SalesList } from "@/features/sales/components/SalesList";

export default async function Page({ searchParams }: PageProps<"/sales/new">) {
  const { clientId } = await searchParams;
  return <SalesList openNew newClientId={typeof clientId === "string" ? clientId : undefined} />;
}
