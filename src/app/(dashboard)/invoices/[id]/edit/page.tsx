import { redirect } from "next/navigation";

export default async function Page({ params }: PageProps<"/invoices/[id]/edit">) {
  const { id } = await params;
  redirect(`/invoices/${id}`);
}
