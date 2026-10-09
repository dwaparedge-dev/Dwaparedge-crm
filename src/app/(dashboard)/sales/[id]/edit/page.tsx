import { SaleFormPage } from "@/features/sales/components/SaleFormPage";

export default async function Page({ params }: PageProps<"/sales/[id]/edit">) {
  const { id } = await params;
  return <SaleFormPage saleId={id} />;
}
