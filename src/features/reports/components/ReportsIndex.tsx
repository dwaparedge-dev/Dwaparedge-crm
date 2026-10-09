"use client";
import Link from "next/link";
import Card from "@mui/material/Card";
import CardActionArea from "@mui/material/CardActionArea";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import type { ReportMeta } from "./ReportView";

export function ReportsIndex() {
  const { data, error, reload } = useFetch<{ items: ReportMeta[] }>("/api/reports");
  return (
    <>
      <PageHeader title="Reports" crumbs={[{ label: "Dashboard", href: "/" }, { label: "Reports" }]} />
      {error ? <ErrorState message={error} onRetry={reload} /> : (
        <Grid container spacing={2}>
          {(data?.items ?? Array.from({ length: 8 }, () => null)).map((r, i) => (
            <Grid key={r?.key ?? i} size={{ xs: 12, sm: 6, lg: 4 }}>
              {r ? (
                <Card sx={{ height: "100%" }}>
                  <CardActionArea component={Link} href={`/reports/${r.key}`} sx={{ height: "100%" }}>
                    <CardContent>
                      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{r.title}</Typography>
                      <Typography variant="body2" color="text.secondary">{r.description}</Typography>
                    </CardContent>
                  </CardActionArea>
                </Card>
              ) : <Skeleton variant="rounded" height={96} />}
            </Grid>
          ))}
        </Grid>
      )}
    </>
  );
}
