import { Suspense } from "react";
import { ShellSkeleton } from "@/components/common/PageSkeletons";
import { AppShell } from "@/components/layout/AppShell";
import { requireUserPage } from "@/lib/auth/current-user";

async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense fallback={<ShellSkeleton />}>
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
