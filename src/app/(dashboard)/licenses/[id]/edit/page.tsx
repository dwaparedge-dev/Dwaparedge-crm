import { LicenseFormPage } from "@/features/licenses/components/LicenseFormPage";

export default async function Page({ params }: PageProps<"/licenses/[id]/edit">) {
  const { id } = await params;
  return <LicenseFormPage licenseId={id} />;
}
