import { LicenseDetail } from "@/features/licenses/components/LicenseDetail";

export default async function Page({ params }: PageProps<"/licenses/[id]">) {
  const { id } = await params;
  return <LicenseDetail id={id} />;
}
