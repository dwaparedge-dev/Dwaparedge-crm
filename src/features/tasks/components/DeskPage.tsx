"use client";
import { useEffect, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import ButtonBase from "@mui/material/ButtonBase";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import MenuItem from "@mui/material/MenuItem";
import Skeleton from "@mui/material/Skeleton";
import TextField from "@mui/material/TextField";
import ToggleButton from "@mui/material/ToggleButton";
import ToggleButtonGroup from "@mui/material/ToggleButtonGroup";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DateRangeIcon from "@mui/icons-material/DateRangeOutlined";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutlineOutlined";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import NotificationsActiveIcon from "@mui/icons-material/NotificationsActiveOutlined";
import PauseCircleIcon from "@mui/icons-material/PauseCircleOutlineOutlined";
import TodayIcon from "@mui/icons-material/TodayOutlined";
import { PageHeader } from "@/components/common/PageHeader";
import { useNotify } from "@/components/common/Notify";
import { StatCards } from "@/components/common/StatCards";
import { EmptyState, ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { useCurrentUser } from "@/components/layout/CurrentUserContext";
import { api } from "@/lib/api-client";
import { daysUntil } from "@/lib/dates";
import type { Desk } from "../desk";
import { filterSections, firstName, greeting, groupByCategory, longDate } from "../display";
import { canViewAll } from "../policy";
import type { TaskRow as TaskData } from "../queries";
import { SECTION_ORDER, type Section } from "../sections";
import { announceTasksChanged } from "../useDeskCounts";
import { SECTION_LABEL } from "./common";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskFormDialog } from "./TaskFormDialog";
import { TaskTimeDialog, type TimeMode } from "./TaskTimeDialog";
import { TaskRow, type RowStatusChange } from "./TaskRow";

type View = "urgency" | "category";
interface StaffOption { id: string; name: string }

/** The chosen view is a convenience kept in the browser; where storage is blocked or empty the Desk is By urgency. */
const VIEW_KEY = "crm_tasks_desk_view";
function loadView(): View {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "category" ? "category" : "urgency";
  } catch {
    return "urgency";
  }
}
function saveView(view: View) {
  try {
    window.localStorage.setItem(VIEW_KEY, view);
  } catch {
    /* storage is blocked: the choice just does not outlast this visit */
  }
}

const rowsBox = { m: 0, p: 0, bgcolor: "background.paper", border: "1px solid", borderColor: "divider", borderRadius: "14px", overflow: "hidden" } as const;

const STATUS_DONE_TEXT: Record<RowStatusChange, string> = { in_progress: "Marked in progress", cancelled: "Task cancelled" };

/** A list of rows in a rounded box. */
function Rows({ children, label }: { children: React.ReactNode; label: string }) {
  return <Box component="ul" aria-label={label} sx={rowsBox}>{children}</Box>;
}

/** Overdue, Follow-ups due and the rest, and a heading that opens and closes its section (Parked starts closed). */
function SectionHeader({ section, count, note, open, onToggle }: { section: Section; count: number; note?: string; open: boolean; onToggle: () => void }) {
  const id = `desk-section-${section}`;
  return (
    <Typography component="h2" variant="subtitle2" sx={{ mb: 1 }}>
      <ButtonBase
        id={`${id}-toggle`} onClick={onToggle} aria-expanded={open} aria-controls={id}
        sx={{ display: "flex", alignItems: "center", gap: 0.75, py: 0.5, borderRadius: 1, textAlign: "left", font: "inherit", color: section === "overdue" ? "error.main" : "text.secondary" }}
      >
        <ExpandMoreIcon fontSize="small" sx={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 150ms" }} />
        <Box component="span" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{SECTION_LABEL[section]}</Box>
        <Chip size="small" label={count} sx={{ height: 20 }} />
        {note && <Box component="span" sx={{ fontWeight: 500, color: "text.secondary" }}>{note}</Box>}
      </ButtonBase>
    </Typography>
  );
}

function DeskSkeleton() {
  return (
    <Box aria-busy="true" aria-label="Loading tasks">
      <Skeleton variant="rounded" height={40} sx={{ mb: 2, maxWidth: 420 }} />
      <Skeleton variant="rounded" height={32} sx={{ mb: 3, maxWidth: 640 }} />
      <Skeleton variant="rounded" height={72} sx={{ mb: 1, borderRadius: "14px" }} />
      <Skeleton variant="rounded" height={72} sx={{ mb: 1, borderRadius: "14px" }} />
      <Skeleton variant="rounded" height={72} sx={{ borderRadius: "14px" }} />
    </Box>
  );
}

/** The founders' morning screen: what needs doing, most urgent first. Spec section 4. */
export function DeskPage() {
  const user = useCurrentUser();
  const notify = useNotify();
  const seeOthers = canViewAll(user);

  const [view, setView] = useState<View>(loadView);
  const [owner, setOwner] = useState("me");
  const [categoryFilter, setCategoryFilter] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<Section | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<Section, boolean>>>({});
  const [form, setForm] = useState<{ task?: TaskData } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ task: TaskData; mode: TimeMode } | null>(null);
  const [cancelling, setCancelling] = useState<TaskData | null>(null);
  const [busy, setBusy] = useState<ReadonlySet<string>>(new Set());

  // Sync, then read: opening the Desk raises any auto-tasks that are due, and only then is the list read, so it is never a minute behind.
  // A sync that fails is not worth an error screen: the list is still true, and the sidebar's poll runs it again within a minute.
  const [synced, setSynced] = useState(false);
  useEffect(() => {
    let cancelled = false;
    api("/api/tasks/sync", { method: "POST" })
      .catch(() => undefined)
      .then(() => { if (!cancelled) setSynced(true); });
    return () => { cancelled = true; };
  }, []);

  const { data: desk, error, loading, reload } = useFetch<Desk>(synced ? `/api/tasks/desk?owner=${encodeURIComponent(owner)}` : null);
  const staff = useFetch<{ items: StaffOption[] }>(seeOthers ? "/api/users/options" : null);

  // When the list was read (a new moment for every new Desk): a follow-up time before it has returned, a greeting for that hour.
  // Until there is a Desk nothing reads it.
  const now = useMemo(() => (desk ? new Date() : new Date(0)), [desk]);

  // A category chip left selected after its last task is gone stops filtering instead of hiding everything.
  const category = desk && desk.categories.some((c) => c.id === categoryFilter) ? categoryFilter : null;
  const visible = useMemo(() => (desk ? filterSections(desk.sections, { categoryId: category, section: sectionFilter }) : null), [desk, category, sectionFilter]);
  const blocks = useMemo(() => (desk && visible ? groupByCategory(visible, desk.categories) : []), [desk, visible]);
  const count = (sections: Record<Section, TaskData[]>) => SECTION_ORDER.reduce((n, s) => n + sections[s].length, 0);
  const total = desk ? count(desk.sections) : 0;
  const shown = visible ? count(visible) : 0;

  const pickView = (v: View) => { setView(v); saveView(v); };
  const pickSection = (s: Section) => {
    setSectionFilter((cur) => (cur === s ? null : s));
    if (s === "parked") setExpanded((e) => ({ ...e, parked: true }));
  };
  const isOpen = (s: Section) => expanded[s] ?? s !== "parked";
  const clearFilters = () => { setCategoryFilter(null); setSectionFilter(null); };

  /** Runs one action on a task, then reads the Desk again (also after a failure: the task may have changed under us) and tells the badge. */
  async function act(task: TaskData, run: () => Promise<unknown>, success: string) {
    setBusy((b) => new Set(b).add(task.id));
    try {
      await run();
      notify.success(success);
      announceTasksChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy((b) => { const next = new Set(b); next.delete(task.id); return next; });
      reload();
    }
  }
  const setStatus = (task: TaskData, status: "done" | RowStatusChange) =>
    act(task, () => api(`/api/tasks/${task.id}/status`, { method: "POST", body: { status } }), status === "done" ? "Marked done" : STATUS_DONE_TEXT[status]);
  const take = (task: TaskData) => act(task, () => api(`/api/tasks/${task.id}`, { method: "PATCH", body: { ownerId: user.id } }), "Assigned to you");

  const rowProps = (task: TaskData, section: Section) => ({
    task, section, today: desk!.today, now, user, showCategory: view === "urgency", busy: busy.has(task.id),
    onOpen: (t: TaskData) => setOpenId(t.id),
    onDone: (t: TaskData) => void (t.origin === "auto" && t.source_type === "demo_request"
      ? act(t, () => api(`/api/tasks/${t.id}/mark-contacted`, { method: "POST", body: {} }), "Marked contacted")
      : setStatus(t, "done")),
    onTake: (t: TaskData) => void take(t),
    onEdit: (t: TaskData) => setForm({ task: t }),
    onTime: (t: TaskData, mode: TimeMode) => setTiming({ task: t, mode }),
    onStatus: (t: TaskData, status: RowStatusChange) => (status === "cancelled" ? setCancelling(t) : void setStatus(t, status)),
  });

  const counts = desk?.counts;
  const stats = [
    { label: "Overdue", value: counts?.overdue ?? 0, icon: <ErrorOutlineIcon />, selected: sectionFilter === "overdue", onClick: () => pickSection("overdue") },
    { label: "Follow-ups due", value: counts?.followUpsDue ?? 0, icon: <NotificationsActiveIcon />, selected: sectionFilter === "followups_due", onClick: () => pickSection("followups_due") },
    { label: "Due today", value: counts?.dueToday ?? 0, icon: <TodayIcon />, selected: sectionFilter === "today", onClick: () => pickSection("today") },
    { label: "Next 7 days", value: counts?.next7 ?? 0, icon: <DateRangeIcon />, selected: sectionFilter === "next7", onClick: () => pickSection("next7") },
    {
      label: "Parked", value: counts?.parked ?? 0, hint: counts && counts.parkedLate > 0 ? `${counts.parkedLate} late` : undefined,
      icon: <PauseCircleIcon />, selected: sectionFilter === "parked", onClick: () => pickSection("parked"),
    },
  ];

  const title = desk ? `${greeting(now)}, ${firstName(user.name)}` : "Desk";

  return (
    <>
      <PageHeader
        title={title} subtitle={desk ? longDate(desk.today) : "What needs doing, most urgent first"}
        actions={<Button id="task-new" variant="contained" startIcon={<AddIcon />} onClick={() => setForm({})}>New task</Button>}
      />
      {(desk || !error) && <StatCards loading={!desk} stats={stats} />}

      {error && <Box sx={{ mb: 2 }}><ErrorState message={error} onRetry={reload} /></Box>}

      {!desk ? (error ? null : <DeskSkeleton />) : (
        <Box aria-busy={loading}>
          <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 2, mb: 1.5 }}>
            <ToggleButtonGroup exclusive size="small" color="primary" value={view} aria-label="Group tasks" onChange={(_, v: View | null) => { if (v) pickView(v); }}>
              <ToggleButton value="urgency" sx={{ px: 2 }}>By urgency</ToggleButton>
              <ToggleButton value="category" sx={{ px: 2 }}>By category</ToggleButton>
            </ToggleButtonGroup>
            {seeOthers && (
              <TextField id="desk-owner" select size="small" label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: { xs: "100%", sm: 240 } }}>
                <MenuItem value="me">Me + Unassigned</MenuItem>
                <MenuItem value="all">Everyone</MenuItem>
                <MenuItem value="unassigned">Unassigned</MenuItem>
                {(staff.data?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.id === user.id ? `${s.name} (me)` : s.name}</MenuItem>)}
              </TextField>
            )}
            {sectionFilter && <Chip label={`Only ${SECTION_LABEL[sectionFilter]}`} onDelete={() => setSectionFilter(null)} />}
          </Box>

          {desk.categories.length > 0 && (
            <Box role="group" aria-label="Filter by category" sx={{ display: "flex", flexWrap: "wrap", gap: 1, mb: 3 }}>
              <Chip label={`All · ${total}`} clickable aria-pressed={category === null} color={category === null ? "primary" : "default"} variant={category === null ? "filled" : "outlined"} onClick={() => setCategoryFilter(null)} />
              {desk.categories.map((c) => (
                <Chip
                  key={c.id} label={`${c.name} · ${c.count}`} clickable aria-pressed={category === c.id}
                  color={category === c.id ? "primary" : "default"} variant={category === c.id ? "filled" : "outlined"}
                  onClick={() => setCategoryFilter(category === c.id ? null : c.id)}
                />
              ))}
            </Box>
          )}

          {total === 0 ? (
            <EmptyState title="Nothing pending" hint="No open tasks in this view." action={<Button variant="contained" startIcon={<AddIcon />} onClick={() => setForm({})}>New task</Button>} />
          ) : shown === 0 ? (
            <EmptyState title="No tasks match" hint="Nothing in this view fits the filters you chose." action={<Button variant="outlined" onClick={clearFilters}>Show everything</Button>} />
          ) : view === "urgency" ? (
            SECTION_ORDER.map((s) => {
              const rows = visible![s];
              if (rows.length === 0) return null;
              const lateParked = s === "parked" ? rows.filter((t) => t.due_date !== null && daysUntil(t.due_date, desk.today) < 0).length : 0;
              const note = s === "parked" ? `chased, back later${lateParked > 0 ? `; ${lateParked} already late` : ""}` : undefined;
              return (
                <Box component="section" key={s} sx={{ mb: 3 }}>
                  <SectionHeader section={s} count={rows.length} note={note} open={isOpen(s)} onToggle={() => setExpanded((e) => ({ ...e, [s]: !isOpen(s) }))} />
                  <Box id={`desk-section-${s}`} hidden={!isOpen(s)}>
                    {isOpen(s) && <Rows label={SECTION_LABEL[s]}>{rows.map((t) => <TaskRow key={t.id} {...rowProps(t, s)} />)}</Rows>}
                  </Box>
                </Box>
              );
            })
          ) : (
            blocks.map((b) => (
              <Box component="section" key={b.id} sx={{ mb: 3 }}>
                <Typography component="h2" variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, py: 0.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "text.secondary" }}>
                  <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: b.colour }} />
                  {b.name}
                  <Chip size="small" label={b.tasks.length} sx={{ height: 20 }} />
                </Typography>
                <Rows label={b.name}>{b.tasks.map(({ task, section }) => <TaskRow key={task.id} {...rowProps(task, section)} />)}</Rows>
              </Box>
            ))
          )}
        </Box>
      )}

      {form && (
        <TaskFormDialog
          task={form.task} onClose={() => setForm(null)}
          onSaved={() => { notify.success(form.task ? "Task updated" : "Task created"); setForm(null); reload(); announceTasksChanged(); }}
        />
      )}
      {timing && (
        <TaskTimeDialog
          task={timing.task} mode={timing.mode} onClose={() => setTiming(null)}
          onDone={(message) => { notify.success(message); setTiming(null); reload(); announceTasksChanged(); }}
        />
      )}
      {openId && desk && <TaskDetailPanel key={openId} taskId={openId} today={desk.today} onClose={() => setOpenId(null)} />}

      {cancelling && (
        <Dialog open onClose={() => setCancelling(null)} maxWidth="xs" fullWidth>
          <DialogTitle>Cancel this task?</DialogTitle>
          <DialogContent>
            <DialogContentText>
              &ldquo;{cancelling.title}&rdquo; leaves the Desk and is marked cancelled. A mistaken task is cancelled rather than deleted, so it stays in the history.
            </DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCancelling(null)}>Keep task</Button>
            <Button color="error" variant="contained" onClick={() => { setCancelling(null); void setStatus(cancelling, "cancelled"); }}>Cancel task</Button>
          </DialogActions>
        </Dialog>
      )}
    </>
  );
}
