import { ReportView } from "@/features/reports/components/ReportView";

export default async function Page({ params }: PageProps<"/reports/[key]">) {
  const { key } = await params;
  return <ReportView reportKey={key} />;
}
