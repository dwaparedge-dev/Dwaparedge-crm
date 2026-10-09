import { LicenseFormPage } from "@/features/licenses/components/LicenseFormPage";

export default async function Page({ searchParams }: PageProps<"/licenses/new">) {
  const { clientId } = await searchParams;
  return <LicenseFormPage clientId={typeof clientId === "string" ? clientId : undefined} />;
}
