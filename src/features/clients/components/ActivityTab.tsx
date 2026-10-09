"use client";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import { format } from "date-fns";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";

interface Item {
  id: string;
  summary: string;
  actor_name: string | null;
  created_at: string;
}

export function ActivityTab({ clientId }: { clientId: string }) {
  const { data, error, loading, reload } = useFetch<{ items: Item[] }>(`/api/clients/${clientId}/activity`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <TableSkeleton rows={4} cols={2} />;
  if (!data || data.items.length === 0) return <EmptyState title="No activity yet" />;
  return (
    <List disablePadding>
      {data.items.map((a) => (
        <ListItem key={a.id} divider disableGutters>
          <ListItemText
            primary={a.summary}
            secondary={`${a.actor_name ?? "System"} · ${format(new Date(a.created_at), "dd MMM yyyy, hh:mm a")}`}
          />
        </ListItem>
      ))}
    </List>
  );
}
