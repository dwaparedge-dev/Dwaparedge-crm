import { PaymentDetail } from "@/features/payments/components/PaymentDetail";

export default async function Page({ params }: PageProps<"/payments/[id]">) {
  const { id } = await params;
  return <PaymentDetail id={id} />;
}
