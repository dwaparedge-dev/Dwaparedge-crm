"use client";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";
import BusinessIcon from "@mui/icons-material/BusinessOutlined";
import EventIcon from "@mui/icons-material/EventOutlined";
import { EmptyState } from "@/components/common/states";
import { daysUntil } from "@/lib/dates";
import { dueText, shortDate } from "../display";
import type { TaskRow as TaskData } from "../queries";
import { CategoryChip, MetaItem, OwnerAvatar, PriorityChip, STATUS_LABEL } from "./common";

interface Props {
  rows: TaskData[];
  total: number;
  loading: boolean;
  /** One-based. */
  page: number;
  pageSize: number;
  today: string;
  onPage: (page: number) => void;
  onOpen: (task: TaskData) => void;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
}

/** All tasks on a phone: one card per task in place of the wide table, with Previous / Next under the list. */
export function TaskCardList({ rows, total, loading, page, pageSize, today, onPage, onOpen, emptyTitle, emptyHint, emptyAction }: Props) {
  if (loading && rows.length === 0) {
    return (
      <Box aria-busy="true" aria-label="Loading tasks" sx={{ p: 1.5, display: "grid", gap: 1 }}>
        {[0, 1, 2].map((i) => <Skeleton key={i} variant="rounded" height={104} sx={{ borderRadius: "12px" }} />)}
      </Box>
    );
  }
  if (rows.length === 0) return <Box sx={{ py: 4 }}><EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} /></Box>;

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  return (
    <Box aria-busy={loading}>
      <Box component="ul" aria-label="Tasks" sx={{ m: 0, p: 1.5, display: "grid", gap: 1.25, listStyle: "none", opacity: loading ? 0.6 : 1 }}>
        {rows.map((t) => {
          // A task that is done or cancelled is not late, whatever its due date says.
          const closed = t.status === "done" || t.status === "cancelled";
          const late = !closed && t.due_date !== null && daysUntil(t.due_date, today) < 0;
          return (
            <Box
              component="li" key={t.id}
              sx={{ position: "relative", overflow: "hidden", border: "1px solid", borderColor: "divider", borderRadius: "12px", bgcolor: "background.paper", pl: 2, pr: 1.5, py: 1.5, boxShadow: "0 2px 10px rgba(15, 23, 42, 0.04)", "&::before": { content: '""', position: "absolute", left: 0, top: 0, bottom: 0, width: 4, bgcolor: t.priority_colour } }}
            >
              <Link
                component="button" type="button" underline="none" onClick={() => onOpen(t)} aria-haspopup="dialog"
                sx={{ display: "block", width: "100%", textAlign: "left", fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.4, color: "text.primary", overflowWrap: "anywhere" }}
              >
                {t.title}
              </Link>
              <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 0.75 }}>
                <Chip size="small" variant="outlined" color={t.status === "done" ? "success" : "default"} label={STATUS_LABEL[t.status]} />
                <PriorityChip name={t.priority_name} colour={t.priority_colour} />
                <CategoryChip name={t.category_name} colour={t.category_colour} />
                {t.origin === "auto" && <Chip size="small" variant="outlined" label="auto" />}
              </Box>
              <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.5, mt: 1 }}>
                <MetaItem icon={<EventIcon />} colour={late ? "error.main" : undefined} weight={late ? 600 : undefined}>
                  {t.due_date === null ? "No due date" : closed ? shortDate(t.due_date) : `${shortDate(t.due_date)} · ${dueText(t.due_date, today)}`}
                </MetaItem>
                <MetaItem icon={<OwnerAvatar name={t.owner_name} />}>{t.owner_name ?? "Unassigned"}</MetaItem>
                {t.client_name && <MetaItem icon={<BusinessIcon />}>{t.client_name}</MetaItem>}
              </Box>
            </Box>
          );
        })}
      </Box>
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 1, px: 1.5, pb: 1.5 }}>
        <Button size="small" variant="outlined" disabled={page <= 1 || loading} onClick={() => onPage(page - 1)}>Previous</Button>
        <Typography variant="caption" color="text.secondary" aria-live="polite">{first}–{last} of {total}</Typography>
        <Button size="small" variant="outlined" disabled={last >= total || loading} onClick={() => onPage(page + 1)}>Next</Button>
      </Box>
    </Box>
  );
}
