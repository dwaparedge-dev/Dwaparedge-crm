import { DeskPage } from "@/features/tasks/components/DeskPage";
import { parseSectionParam } from "@/features/tasks/needs-you";

export default async function Page({ searchParams }: PageProps<"/tasks">) {
  const { section } = await searchParams;
  const initial = parseSectionParam(section);
  // The key restarts the Desk when the Dashboard sends you here with a different section while you are already on the page.
  return <DeskPage key={initial ?? "all"} initialSection={initial} />;
}
