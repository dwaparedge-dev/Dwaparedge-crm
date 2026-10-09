import { Suspense } from "react";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { AppShell } from "@/components/layout/AppShell";
import { requireUserPage } from "@/lib/auth/current-user";

async function AuthedShell({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();
  return <AppShell user={{ name: user.name, email: user.email }}>{children}</AppShell>;
}

export default function DashboardLayout({ children }: LayoutProps<"/">) {
  return (
    <Suspense
      fallback={
        <Box sx={{ display: "grid", placeItems: "center", minHeight: "100vh" }}>
          <CircularProgress aria-label="Loading" />
        </Box>
      }
    >
      <AuthedShell>{children}</AuthedShell>
    </Suspense>
  );
}
