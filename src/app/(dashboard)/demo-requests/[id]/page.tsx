import { DemoRequestDetail } from "@/features/demo-requests/components/DemoRequestDetail";

export default async function Page({ params }: PageProps<"/demo-requests/[id]">) {
  const { id } = await params;
  return <DemoRequestDetail id={id} />;
}
