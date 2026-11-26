"use client";
import { format } from "date-fns";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import List from "@mui/material/List";
import ListItem from "@mui/material/ListItem";
import ListItemText from "@mui/material/ListItemText";
import Typography from "@mui/material/Typography";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import type { Journey } from "../reports";
import { countryName, duration, SECTION_LABEL } from "../format";

const when = (v: string) => format(new Date(v), "dd MMM yyyy, hh:mm a");

function describe(e: Journey["sessions"][number]["events"][number]): string | null {
  if (e.type === "pageview") return `Opened ${e.path}`;
  if (e.type === "engagement") return `Spent ${duration(e.duration_s ?? 0)} on ${e.path}${e.scroll_pct != null ? `, scrolled ${e.scroll_pct}%` : ""}`;
  if (e.name === "form_start") return "Started filling the demo form";
  if (e.name === "demo_request") return "Submitted the demo request";
  if (e.name?.startsWith("section_")) return `Scrolled to: ${SECTION_LABEL[e.name] ?? e.name.slice(8)}`;
  return e.name;
}

/** What the browser behind this demo request did on the website. Empty when the person had not accepted analytics. */
export function WebsiteActivity({ requestId }: { requestId: string }) {
  const { data, error, loading, reload } = useFetch<Journey>(`/api/demo-requests/${requestId}/journey`);
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <TableSkeleton rows={4} cols={2} />;
  if (!data?.linked || !data.visitor) {
    return <EmptyState title="No website activity for this request" hint="The visitor had not accepted analytics on the website, or the data has passed its retention period and was erased." />;
  }
  const v = data.visitor;
  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      <Typography variant="body2" color="text.secondary">
        First seen {when(v.first_seen_at)} · {v.session_count} visit{v.session_count === 1 ? "" : "s"} · {v.pageview_count} page view{v.pageview_count === 1 ? "" : "s"}
        {v.first_referrer_host ? ` · first arrived from ${v.first_referrer_host}` : ""}
      </Typography>
      {data.sessions.map((s) => (
        <Box key={s.id} sx={{ border: 1, borderColor: "divider", borderRadius: 2, p: 2 }}>
          <Box sx={{ display: "flex", flexWrap: "wrap", gap: 1, alignItems: "center", mb: 1 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>{when(s.started_at)}</Typography>
            <Chip size="small" label={s.channel} />
            {s.utm_campaign && <Chip size="small" variant="outlined" label={`campaign: ${s.utm_campaign}`} />}
            <Chip size="small" variant="outlined" label={[s.city, s.region, countryName(s.country)].filter(Boolean).join(", ")} />
            <Chip size="small" variant="outlined" label={[s.device_type, s.browser].filter(Boolean).join(" · ")} />
            <Typography variant="caption" color="text.secondary">{s.page_count} page{s.page_count === 1 ? "" : "s"} · {duration(s.active_s)} active</Typography>
          </Box>
          <List dense disablePadding>
            {s.events.map((e, i) => {
              const text = describe(e);
              return text ? <ListItem key={i} disableGutters sx={{ py: 0.25 }}><ListItemText primary={text} secondary={format(new Date(e.occurred_at), "hh:mm:ss a")} /></ListItem> : null;
            })}
          </List>
        </Box>
      ))}
    </Box>
  );
}
