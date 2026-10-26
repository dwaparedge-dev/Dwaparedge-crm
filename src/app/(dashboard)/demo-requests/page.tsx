import { DemoRequestsList } from "@/features/demo-requests/components/DemoRequestsList";

export default async function Page({ searchParams }: PageProps<"/demo-requests">) {
  const { status } = await searchParams;
  const initial = typeof status === "string" ? status : "";
  // The key restarts the list when the bell sends you here with a different filter while you are already on the page.
  return <DemoRequestsList key={initial} initialStatus={initial} />;
}
