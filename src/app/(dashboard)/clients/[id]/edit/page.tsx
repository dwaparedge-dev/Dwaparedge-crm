import { redirect } from "next/navigation";

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  const { id } = await params;
  redirect(`/clients/${id}`);
}
