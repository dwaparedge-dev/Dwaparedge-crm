import { redirect } from "next/navigation";

export default async function Page({ params }: PageProps<"/licenses/[id]/edit">) {
  const { id } = await params;
  redirect(`/licenses/${id}`);
}
