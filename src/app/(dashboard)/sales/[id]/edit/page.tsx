import { redirect } from "next/navigation";

export default async function Page({ params }: PageProps<"/sales/[id]/edit">) {
  const { id } = await params;
  redirect(`/sales/${id}`);
}
