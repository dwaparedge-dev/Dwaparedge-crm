import { LicensesList } from "@/features/licenses/components/LicensesList";

export default async function Page({ searchParams }: PageProps<"/licenses/new">) {
  const { clientId } = await searchParams;
  return <LicensesList openNew newClientId={typeof clientId === "string" ? clientId : undefined} />;
}
