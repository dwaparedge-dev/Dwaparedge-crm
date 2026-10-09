import { SaleDetail } from "@/features/sales/components/SaleDetail";

export default async function Page({ params }: PageProps<"/sales/[id]">) {
  const { id } = await params;
  return <SaleDetail id={id} />;
}
