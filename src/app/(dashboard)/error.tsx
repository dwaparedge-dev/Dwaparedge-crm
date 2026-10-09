"use client";
import { ErrorPanel } from "@/components/common/ErrorPanel";

export default function DashboardError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return <ErrorPanel error={error} retry={retry} />;
}
