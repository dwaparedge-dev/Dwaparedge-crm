import { ClientDetail } from "@/features/clients/components/ClientDetail";

export default async function ClientPage({ params }: PageProps<"/clients/[id]">) {
  const { id } = await params;
  return <ClientDetail id={id} />;
}
