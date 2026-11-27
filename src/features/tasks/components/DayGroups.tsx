"use client";
import Box from "@mui/material/Box";
import type { TaskRow as TaskData } from "../queries";
import type { Section } from "../sections";
import { daysUntil } from "@/lib/dates";
import { dayRail, groupByDay } from "../display";

interface Props {
  label: string;
  /** The India date the Desk was worked out for, `YYYY-MM-DD`. */
  today: string;
  items: { task: TaskData; section: Section }[];
  render: (task: TaskData, section: Section) => React.ReactNode;
}

/** Tasks under their due date on a calendar rail: the day, then its tasks. Today is accented, a day that has passed is red. */
export function DayGroups({ label, today, items, render }: Props) {
  const groups = groupByDay(items.map((i) => ({ ...i, due_date: i.task.due_date })));
  return (
    <Box component="div" role="group" aria-label={label} sx={{ display: "grid", gap: 1.75 }}>
      {groups.map((g, gi) => {
        const rail = g.date ? dayRail(g.date) : null;
        const days = g.date ? daysUntil(g.date, today) : null;
        const colour = days === null ? "text.disabled" : days < 0 ? "error.main" : days === 0 ? "primary.main" : "text.primary";
        const last = gi === groups.length - 1;
        return (
          <Box key={g.date ?? "none"} sx={{ display: "grid", gridTemplateColumns: { xs: "44px minmax(0, 1fr)", sm: "72px minmax(0, 1fr)" }, columnGap: { xs: 1.25, sm: 2 } }}>
            <Box
              aria-hidden
              sx={{
                position: "relative", textAlign: "center", pt: 0.25, color: colour,
                "&::after": last ? undefined : { content: '""', position: "absolute", left: "50%", top: 62, bottom: -14, width: 2, bgcolor: "divider", transform: "translateX(-50%)" },
              }}
            >
              {rail ? (
                <>
                  <Box sx={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>{rail.weekday}</Box>
                  <Box sx={{ fontSize: { xs: "1.25rem", sm: "1.6rem" }, fontWeight: 700, lineHeight: 1.15 }}>{rail.day}</Box>
                  <Box sx={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary" }}>{rail.month}</Box>
                </>
              ) : (
                <Box sx={{ fontSize: "0.68rem", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: "text.secondary", pt: 1 }}>No date</Box>
              )}
            </Box>
            <Box component="ul" sx={{ m: 0, p: 0, display: "grid", gap: 1, minWidth: 0, listStyle: "none" }}>
              {g.tasks.map((i) => render(i.task, i.section))}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}
