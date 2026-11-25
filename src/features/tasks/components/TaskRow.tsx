"use client";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Typography from "@mui/material/Typography";
import CheckIcon from "@mui/icons-material/Check";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import type { CurrentUserValue } from "@/components/layout/CurrentUserContext";
import { daysUntil } from "@/lib/dates";
import { dueText, followUpsText, formatWhen } from "../display";
import { canAssign, canEditRow } from "../policy";
import type { TaskRow as TaskData } from "../queries";
import { isFollowUpDue, isStuck, type Section } from "../sections";
import { CategoryChip, PriorityChip, STATUS_LABEL } from "./common";
import type { TimeMode } from "./TaskTimeDialog";

export type RowStatusChange = "in_progress" | "cancelled";

interface Props {
  task: TaskData;
  section: Section;
  /** The India date the Desk was worked out for, `YYYY-MM-DD`. */
  today: string;
  /** When the Desk was read: a follow-up time before it has returned. */
  now: Date;
  user: CurrentUserValue;
  /** The category is the block's heading in the By category view, so the row leaves it out there. */
  showCategory: boolean;
  /** An action on this task is on its way. */
  busy: boolean;
  onOpen: (task: TaskData) => void;
  onDone: (task: TaskData) => void;
  onTake: (task: TaskData) => void;
  onEdit: (task: TaskData) => void;
  onStatus: (task: TaskData, status: RowStatusChange) => void;
  onTime: (task: TaskData, mode: TimeMode) => void;
}

/** One task on the Desk: what it is, when it is due, who has it, and the few things done to it from the list. */
export function TaskRow({ task: t, section, today, now, user, showCategory, busy, onOpen, onDone, onTake, onEdit, onStatus, onTime }: Props) {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const closeMenu = () => setAnchor(null);

  const canEdit = canEditRow(user, t);
  const canTake = t.owner_id === null && canAssign(user);
  const late = t.due_date !== null && daysUntil(t.due_date, today) < 0;
  const followUpDue = isFollowUpDue({ status: t.status, dueDate: t.due_date, followUpAt: t.follow_up_at }, now);

  return (
    <Box
      component="li"
      sx={{
        listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) auto" }, gap: 1, alignItems: "center",
        px: { xs: 1.5, sm: 2 }, py: 1.5, borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { borderBottom: 0 }, opacity: busy ? 0.55 : 1,
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mb: 0.5 }}>
          <PriorityChip name={t.priority_name} colour={t.priority_colour} />
          {showCategory && <CategoryChip name={t.category_name} colour={t.category_colour} />}
          {!showCategory && section === "parked" && <Chip size="small" variant="outlined" label="Parked" />}
          {t.origin === "auto" && <Chip size="small" variant="outlined" label="auto" />}
          {followUpDue && <Chip size="small" color="info" variant="outlined" label="Follow-up due" />}
          {isStuck(t.follow_up_count) && <Chip size="small" color="warning" label="Stuck" />}
        </Box>

        <Link
          component="button" type="button" underline="hover" onClick={() => onOpen(t)} aria-haspopup="dialog"
          sx={{ display: "block", maxWidth: "100%", textAlign: "left", fontWeight: 600, fontSize: "0.95rem", lineHeight: 1.4, color: "text.primary", overflowWrap: "anywhere" }}
        >
          {t.title}
        </Link>

        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 1.5, rowGap: 0.25, mt: 0.5, color: "text.secondary" }}>
          {t.client_name && <Typography variant="caption">{t.client_name}</Typography>}
          <Typography variant="caption" sx={late ? { color: "error.main", fontWeight: 600 } : undefined}>{dueText(t.due_date, today)}</Typography>
          {section === "parked" && t.follow_up_at && <Typography variant="caption">Back {formatWhen(t.follow_up_at)}</Typography>}
          {t.status !== "open" && (
            <Typography variant="caption">{STATUS_LABEL[t.status]}{t.status === "waiting" && t.waiting_on ? ` on ${t.waiting_on}` : ""}</Typography>
          )}
          {t.follow_up_count > 0 && <Typography variant="caption">{followUpsText(t.follow_up_count)}</Typography>}
          <Typography variant="caption">{t.owner_name ? `Owner: ${t.owner_name}` : "Unassigned"}</Typography>
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, justifySelf: { xs: "start", sm: "end" } }}>
        {canEdit && (
          <Button size="small" variant="outlined" startIcon={<CheckIcon />} disabled={busy} onClick={() => onDone(t)} aria-label={`${t.source_type === "demo_request" ? "Mark contacted" : "Done"}: ${t.title}`}>{t.origin === "auto" && t.source_type === "demo_request" ? "Mark contacted" : "Done"}</Button>
        )}
        {canEdit && (
          <Button size="small" variant="outlined" disabled={busy} onClick={() => onTime(t, "followup")} aria-label={`Follow up: ${t.title}`}>Follow up</Button>
        )}
        {canTake && (
          <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} disabled={busy} onClick={() => onTake(t)} aria-label={`Take it: ${t.title}`}>Take it</Button>
        )}
        {canEdit && (
          <>
            <IconButton size="small" disabled={busy} onClick={(e) => setAnchor(e.currentTarget)} aria-label={`More actions: ${t.title}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
              <MenuItem onClick={() => { closeMenu(); onEdit(t); }}>Edit</MenuItem>
              <MenuItem onClick={() => { closeMenu(); onTime(t, "snooze"); }}>Snooze</MenuItem>
              {t.status !== "waiting" && <MenuItem onClick={() => { closeMenu(); onTime(t, "waiting"); }}>Mark waiting</MenuItem>}
              {t.status !== "in_progress" && <MenuItem onClick={() => { closeMenu(); onStatus(t, "in_progress"); }}>Mark in progress</MenuItem>}
              <MenuItem onClick={() => { closeMenu(); onStatus(t, "cancelled"); }}>Cancel task</MenuItem>
            </Menu>
          </>
        )}
      </Box>
    </Box>
  );
}
