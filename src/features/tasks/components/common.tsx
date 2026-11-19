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
