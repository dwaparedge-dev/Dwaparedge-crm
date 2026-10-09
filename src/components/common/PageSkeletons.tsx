"use client";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import ChartSkeleton from "@/components/shared/skeletons/ChartSkeleton";
import TableSkeleton from "@/components/shared/skeletons/TableSkeleton";
import { DetailViewLayout } from "@/components/shared/DetailView";

const cardSx = { borderRadius: "14px", border: "1px solid #e2e8f0", boxShadow: "0 6px 24px rgba(15, 23, 42, 0.05)", overflow: "hidden" } as const;

/** The page banner (title + actions) while the page loads. */
function BannerSkeleton() {
  return <Skeleton variant="rounded" height={84} sx={{ mt: { xs: 1, md: 2 }, borderRadius: "14px" }} />;
}

function StatRowSkeleton({ count = 4 }: { count?: number }) {
  return (
    <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", md: `repeat(${count}, minmax(0, 1fr))` }, gap: { xs: 1.25, md: 2.5 }, my: 2.5 }}>
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} variant="rounded" height={84} sx={{ borderRadius: "14px" }} />)}
    </Box>
  );
}

/** Banner, stat cards, search bar and a table: the shape of every list page. */
export function ListPageSkeleton({ stats = 4 }: { stats?: number }) {
  return (
    <Box aria-busy="true" aria-label="Loading page">
      <BannerSkeleton />
      <StatRowSkeleton count={stats} />
      <Skeleton variant="rounded" height={58} sx={{ mb: 2.5, borderRadius: "12px" }} />
      <Card sx={cardSx}>
        <Box sx={{ display: "flex", justifyContent: "space-between", gap: 2, px: 2.5, py: 1.5, borderBottom: "1px solid #e2e8f0" }}>
          <Skeleton variant="rounded" width={220} height={36} />
          <Box sx={{ display: "flex", gap: 1 }}><Skeleton variant="rounded" width={36} height={36} /><Skeleton variant="rounded" width={36} height={36} /></Box>
        </Box>
        <TableSkeleton standalone={false} rowCount={7} columnCount={6} showPagination />
      </Card>
    </Box>
  );
}

/** Sidebar, metric strip and a tabbed card: the shape of every record page. */
export function DetailPageSkeleton() {
  return <DetailViewLayout isLoading sidebar={null}>{null}</DetailViewLayout>;
}

/** KPI cards and chart cards (the dashboard below its banner and filters). */
export function DashboardBodySkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading dashboard">
      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "repeat(2, minmax(0, 1fr))", lg: "repeat(6, minmax(0, 1fr))" }, gap: 1.5, mb: 2 }}>
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "12px" }} />)}
      </Box>
      <Grid container spacing={2}>
        <Grid size={{ xs: 12, lg: 8 }}><Card sx={{ ...cardSx, p: 2 }}><Skeleton variant="text" width={180} /><ChartSkeleton variant="area" height={280} /></Card></Grid>
        <Grid size={{ xs: 12, lg: 4 }}><Card sx={{ ...cardSx, p: 2 }}><Skeleton variant="text" width={160} /><ChartSkeleton variant="donut" height={280} /></Card></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Card sx={{ ...cardSx, p: 2 }}><TableSkeleton standalone={false} rowCount={5} columnCount={4} /></Card></Grid>
        <Grid size={{ xs: 12, lg: 6 }}><Card sx={{ ...cardSx, p: 2 }}><TableSkeleton standalone={false} rowCount={5} columnCount={4} /></Card></Grid>
      </Grid>
    </Box>
  );
}

/** Banner, filters, then the dashboard body. */
export function DashboardSkeleton() {
  return (
    <Box>
      <BannerSkeleton />
      <Box sx={{ display: "flex", gap: 1.5, my: 1.5 }}>
        <Skeleton variant="rounded" width={180} height={40} />
        <Skeleton variant="rounded" width={150} height={40} sx={{ display: { xs: "none", sm: "block" } }} />
        <Skeleton variant="rounded" width={150} height={40} sx={{ display: { xs: "none", sm: "block" } }} />
      </Box>
      <DashboardBodySkeleton />
    </Box>
  );
}

/** Banner and stacked form cards (settings). */
export function FormPageSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading page">
      <BannerSkeleton />
      <Skeleton variant="rounded" height={46} width={320} sx={{ my: 2.5 }} />
      <Card sx={{ ...cardSx, p: 3 }}>
        <Skeleton variant="text" width={160} height={28} />
        <Grid container spacing={2} sx={{ mt: 1 }}>
          {Array.from({ length: 8 }, (_, i) => <Grid key={i} size={{ xs: 12, md: 6 }}><Skeleton variant="rounded" height={52} /></Grid>)}
        </Grid>
      </Card>
    </Box>
  );
}

/** The app frame (sidebar, top bar, page) while the signed-in user is being checked. */
export function ShellSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading" sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>
      <Box sx={{ display: { xs: "none", md: "block" }, width: 260, flexShrink: 0, p: 2 }}>
        <Skeleton variant="rounded" height={44} sx={{ mb: 3 }} />
        {Array.from({ length: 8 }, (_, i) => <Skeleton key={i} variant="rounded" height={36} sx={{ mb: 1.25 }} />)}
      </Box>
      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
        <Box sx={{ px: { xs: 1.5, md: 3 }, pt: 2, pb: 2.5 }}><Skeleton variant="rounded" height={54} sx={{ borderRadius: "14px" }} /></Box>
        <Box sx={{ bgcolor: "#fff", px: { xs: 2, md: 3 }, pt: { xs: 2.5, md: 4 }, pb: 6, borderTopLeftRadius: { md: 16 }, minHeight: "70vh" }}>
          <ListPageSkeleton />
        </Box>
      </Box>
    </Box>
  );
}
