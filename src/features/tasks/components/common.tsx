import type React from "react";
import Box from "@mui/material/Box";
import Chip from "@mui/material/Chip";
import type { TaskStatus } from "../schema";
import type { Section } from "../sections";

export const STATUS_LABEL: Record<TaskStatus, string> = { open: "Open", in_progress: "In progress", waiting: "Waiting", done: "Done", cancelled: "Cancelled" };

export const SECTION_LABEL: Record<Section, string> = {
  overdue: "Overdue",
  followups_due: "Follow-ups due",
  today: "Due today",
  next7: "Next 7 days",
  later: "No date / later",
  parked: "Parked",
};

/** The colour is a dot beside the name, never the chip's text colour: the name carries the meaning and keeps its contrast. */
function Dot({ colour }: { colour: string }) {
  return <Box component="span" aria-hidden sx={{ width: 9, height: 9, borderRadius: "50%", bgcolor: colour, flexShrink: 0, ml: 1, mr: -0.25 }} />;
}

/** `colour` is `#rrggbb` (the settings screens refuse anything else), so adding two hex digits gives that colour with an alpha. */
export function PriorityChip({ name, colour }: { name: string; colour: string }) {
  return <Chip size="small" variant="outlined" icon={<Dot colour={colour} />} label={name} sx={{ fontWeight: 700, borderColor: `${colour}88`, bgcolor: `${colour}14` }} />;
}

export function CategoryChip({ name, colour }: { name: string; colour: string }) {
  return <Chip size="small" variant="outlined" icon={<Dot colour={colour} />} label={name} sx={{ borderColor: `${colour}55` }} />;
}

/** Each Desk section has one colour, used for its dot and its row accent so a long list can be scanned by colour as well as by heading. */
export const SECTION_COLOUR: Record<Section, string> = {
  overdue: "error.main",
  followups_due: "info.main",
  today: "success.main",
  next7: "warning.main",
  later: "text.disabled",
  parked: "secondary.main",
};

/** A line of icons and short text: the due date, the owner, the client. */
export function MetaItem({ icon, children, colour, weight }: { icon: React.ReactNode; children: React.ReactNode; colour?: string; weight?: number }) {
  return (
    <Box component="span" sx={{ display: "inline-flex", alignItems: "center", gap: 0.5, minWidth: 0, color: colour ?? "text.secondary", fontWeight: weight, fontSize: "0.8125rem", lineHeight: 1.4, "& svg": { fontSize: 15, flexShrink: 0, opacity: 0.85 } }}>
      {icon}
      <Box component="span" sx={{ minWidth: 0, overflowWrap: "anywhere" }}>{children}</Box>
    </Box>
  );
}

/** Two letters of a name in a small round badge, so who owns a task is seen at a glance. */
export function OwnerAvatar({ name }: { name: string | null }) {
  const letters = (name ?? "").trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase() ?? "").join("");
  return (
    <Box component="span" aria-hidden sx={{ width: 18, height: 18, borderRadius: "50%", bgcolor: name ? "primary.main" : "action.disabledBackground", color: name ? "primary.contrastText" : "text.secondary", fontSize: 9, fontWeight: 700, display: "inline-grid", placeItems: "center", flexShrink: 0 }}>
      {letters || "?"}
    </Box>
  );
}
