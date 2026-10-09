import { ClientFormPage } from "@/features/clients/components/ClientFormPage";

export default async function EditClientPage({ params }: PageProps<"/clients/[id]/edit">) {
  const { id } = await params;
  return <ClientFormPage clientId={id} />;
}
