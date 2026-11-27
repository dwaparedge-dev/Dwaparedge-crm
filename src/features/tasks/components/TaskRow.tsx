"use client";
import { useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import BusinessIcon from "@mui/icons-material/BusinessOutlined";
import CheckIcon from "@mui/icons-material/Check";
import EventIcon from "@mui/icons-material/EventOutlined";
import HistoryIcon from "@mui/icons-material/HistoryOutlined";
import HourglassIcon from "@mui/icons-material/HourglassEmptyOutlined";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import PersonAddIcon from "@mui/icons-material/PersonAddAlt1Outlined";
import type { CurrentUserValue } from "@/components/layout/CurrentUserContext";
import { daysUntil } from "@/lib/dates";
import { dueText, followUpsText, formatWhen } from "../display";
import { canAssign, canEditRow } from "../policy";
import type { TaskRow as TaskData } from "../queries";
import { isFollowUpDue, isStuck, type Section } from "../sections";
import { CategoryChip, MetaItem, OwnerAvatar, PriorityChip, STATUS_LABEL } from "./common";
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
  const contacting = t.origin === "auto" && t.source_type === "demo_request";
  const doneLabel = contacting ? "Mark contacted" : "Done";

  return (
    <Box
      component="li"
      sx={{
        listStyle: "none", display: "grid", gridTemplateColumns: { xs: "minmax(0, 1fr)", sm: "minmax(0, 1fr) auto" }, gap: { xs: 1, sm: 2 }, alignItems: "center",
        px: { xs: 1.5, sm: 2 }, py: 1.5, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderLeft: "4px solid", borderLeftColor: t.priority_colour,
        borderRadius: "12px", opacity: busy ? 0.55 : 1, transition: "box-shadow 120ms, border-color 120ms", "&:hover": { boxShadow: "0 4px 16px rgba(15, 23, 42, 0.08)" },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Link
          component="button" type="button" underline="hover" onClick={() => onOpen(t)} aria-haspopup="dialog"
          sx={{ display: "block", maxWidth: "100%", textAlign: "left", fontWeight: 600, fontSize: "0.9375rem", lineHeight: 1.4, color: "text.primary", overflowWrap: "anywhere", py: 0.25 }}
        >
          {t.title}
        </Link>

        <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 0.75, mt: 0.75 }}>
          <PriorityChip name={t.priority_name} colour={t.priority_colour} />
          {showCategory && <CategoryChip name={t.category_name} colour={t.category_colour} />}
          {!showCategory && section === "parked" && <Chip size="small" variant="outlined" label="Parked" />}
          {t.origin === "auto" && <Chip size="small" variant="outlined" label="auto" />}
          {followUpDue && <Chip size="small" color="info" variant="outlined" label="Follow-up due" />}
          {isStuck(t.follow_up_count) && <Chip size="small" color="warning" label="Stuck" />}
        </Box>

        <Box sx={{ display: "flex", flexWrap: "wrap", columnGap: 2, rowGap: 0.5, mt: 1 }}>
          <MetaItem icon={<EventIcon />} colour={late ? "error.main" : undefined} weight={late ? 600 : undefined}>{dueText(t.due_date, today)}</MetaItem>
          <MetaItem icon={<OwnerAvatar name={t.owner_name} />}>{t.owner_name ?? "Unassigned"}</MetaItem>
          {t.client_name && <MetaItem icon={<BusinessIcon />}>{t.client_name}</MetaItem>}
          {section === "parked" && t.follow_up_at && <MetaItem icon={<HistoryIcon />}>Back {formatWhen(t.follow_up_at)}</MetaItem>}
          {t.status !== "open" && (
            <MetaItem icon={<HourglassIcon />}>{STATUS_LABEL[t.status]}{t.status === "waiting" && t.waiting_on ? ` on ${t.waiting_on}` : ""}</MetaItem>
          )}
          {t.follow_up_count > 0 && <MetaItem icon={<HistoryIcon />}>{followUpsText(t.follow_up_count)}</MetaItem>}
        </Box>
      </Box>

      <Box sx={{ display: "flex", alignItems: "center", gap: 0.75, justifySelf: { xs: "stretch", sm: "end" } }}>
        {canEdit && (
          <Button
            size="small" variant="outlined" color="success" startIcon={<CheckIcon />} disabled={busy} onClick={() => onDone(t)} aria-label={`${doneLabel}: ${t.title}`}
            sx={{ borderRadius: 10, flex: { xs: 1, sm: "none" } }}
          >
            {doneLabel}
          </Button>
        )}
        {canEdit && (
          <Button size="small" variant="outlined" disabled={busy} onClick={() => onTime(t, "followup")} aria-label={`Follow up: ${t.title}`} sx={{ display: { xs: "none", md: "inline-flex" }, borderRadius: 10 }}>Follow up</Button>
        )}
        {canTake && (
          <>
            <Button size="small" variant="outlined" startIcon={<PersonAddIcon />} disabled={busy} onClick={() => onTake(t)} aria-label={`Take it: ${t.title}`} sx={{ display: { xs: "none", sm: "inline-flex" }, borderRadius: 10 }}>Take it</Button>
            <Tooltip title="Take it">
              <IconButton size="small" disabled={busy} onClick={() => onTake(t)} aria-label={`Take it: ${t.title}`} sx={{ display: { xs: "inline-flex", sm: "none" } }}><PersonAddIcon fontSize="small" /></IconButton>
            </Tooltip>
          </>
        )}
        {canEdit && (
          <>
            <IconButton disabled={busy} onClick={(e) => setAnchor(e.currentTarget)} aria-label={`More actions: ${t.title}`} aria-haspopup="menu" aria-expanded={Boolean(anchor)}>
              <MoreVertIcon fontSize="small" />
            </IconButton>
            <Menu anchorEl={anchor} open={Boolean(anchor)} onClose={closeMenu}>
              <MenuItem sx={{ display: { md: "none" } }} onClick={() => { closeMenu(); onTime(t, "followup"); }}>Follow up</MenuItem>
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
