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
import FilterToolbar from "@/components/shared/FilterToolbar";
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
import { SECTION_COLOUR, SECTION_LABEL } from "./common";
import { DayGroups } from "./DayGroups";
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

const STATUS_DONE_TEXT: Record<RowStatusChange, string> = { in_progress: "Marked in progress", cancelled: "Task cancelled" };

/** Overdue, Follow-ups due and the rest, and a heading that opens and closes its section (Parked starts closed). */
function SectionHeader({ section, count, note, open, onToggle }: { section: Section; count: number; note?: string; open: boolean; onToggle: () => void }) {
  const id = `desk-section-${section}`;
  return (
    <Typography component="h2" variant="subtitle2" sx={{ mb: 1 }}>
      <ButtonBase
        id={`${id}-toggle`} onClick={onToggle} aria-expanded={open} aria-controls={id}
        sx={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 0.75, py: 0.75, pr: 1, borderRadius: 1, textAlign: "left", font: "inherit", color: section === "overdue" ? "error.main" : "text.secondary" }}
      >
        <ExpandMoreIcon fontSize="small" sx={{ transform: open ? "none" : "rotate(-90deg)", transition: "transform 150ms" }} />
        <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: SECTION_COLOUR[section] }} />
        <Box component="span" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px" }}>{SECTION_LABEL[section]}</Box>
        <Chip size="small" label={count} sx={{ height: 20 }} />
        {note && <Box component="span" sx={{ fontWeight: 500, color: "text.secondary", fontSize: "0.75rem" }}>{note}</Box>}
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
  const [priorityFilter, setPriorityFilter] = useState<string | null>(null);
  const [sectionFilter, setSectionFilter] = useState<Section | null>(null);
  const [expanded, setExpanded] = useState<Partial<Record<Section, boolean>>>({});
  const [form, setForm] = useState<{ task?: TaskData } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [timing, setTiming] = useState<{ task: TaskData; mode: TimeMode } | null>(null);
  // Every action that changes a task asks first. Cancel keeps its own, stronger wording.
  const [cancelling, setCancelling] = useState<TaskData | null>(null);
  const [confirming, setConfirming] = useState<{ task: TaskData; kind: "done" | "take" | "in_progress" } | null>(null);
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
  // The priorities of the tasks in view (highest first), with how many tasks each has; the chips are built from the tasks, so a
  // priority nobody is using does not clutter the Desk.
  const priorities = useMemo(() => {
    const found = new Map<string, { id: string; name: string; colour: string; rank: number; count: number }>();
    if (desk) for (const s of SECTION_ORDER) for (const t of desk.sections[s]) {
      const p = found.get(t.priority_id);
      if (p) p.count++;
      else found.set(t.priority_id, { id: t.priority_id, name: t.priority_name, colour: t.priority_colour, rank: t.priority_rank, count: 1 });
    }
    return [...found.values()].sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name));
  }, [desk]);
  const priority = priorities.some((p) => p.id === priorityFilter) ? priorityFilter : null;
  const visible = useMemo(
    () => (desk ? filterSections(desk.sections, { categoryId: category, priorityId: priority, section: sectionFilter }) : null),
    [desk, category, priority, sectionFilter],
  );
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
  const clearFilters = () => { setCategoryFilter(null); setPriorityFilter(null); setSectionFilter(null); };

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
    onDone: (t: TaskData) => setConfirming({ task: t, kind: "done" }),
    onTake: (t: TaskData) => setConfirming({ task: t, kind: "take" }),
    onEdit: (t: TaskData) => setForm({ task: t }),
    onTime: (t: TaskData, mode: TimeMode) => setTiming({ task: t, mode }),
    onStatus: (t: TaskData, status: RowStatusChange) => (status === "cancelled" ? setCancelling(t) : setConfirming({ task: t, kind: "in_progress" })),
  });

  /** The confirmed action, run exactly as the row buttons used to run it directly. */
  const runConfirmed = ({ task: t, kind }: NonNullable<typeof confirming>) => {
    setConfirming(null);
    if (kind === "take") return void take(t);
    if (kind === "in_progress") return void setStatus(t, "in_progress");
    if (t.origin === "auto" && t.source_type === "demo_request") return void act(t, () => api(`/api/tasks/${t.id}/mark-contacted`, { method: "POST", body: {} }), "Marked contacted");
    void setStatus(t, "done");
  };

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
          <FilterToolbar
            sx={{ mb: 3 }}
            leftFilters={
              <>
                <ToggleButtonGroup
                  exclusive size="small" color="primary" value={view} aria-label="Group tasks" onChange={(_, v: View | null) => { if (v) pickView(v); }}
                  sx={{ width: { xs: "100%", sm: "auto" }, "& .MuiToggleButton-root": { flex: { xs: 1, sm: "none" }, px: 2, height: 38, fontWeight: 600 } }}
                >
                  <ToggleButton value="urgency">By urgency</ToggleButton>
                  <ToggleButton value="category">By category</ToggleButton>
                </ToggleButtonGroup>
                {seeOthers && (
                  <TextField id="desk-owner" select size="small" label="Owner" value={owner} onChange={(e) => setOwner(e.target.value)} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 190 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
                    <MenuItem value="me">Me + Unassigned</MenuItem>
                    <MenuItem value="all">Everyone</MenuItem>
                    <MenuItem value="unassigned">Unassigned</MenuItem>
                    {(staff.data?.items ?? []).map((s) => <MenuItem key={s.id} value={s.id}>{s.id === user.id ? `${s.name} (me)` : s.name}</MenuItem>)}
                  </TextField>
                )}
                {desk.categories.length > 0 && (
                  <TextField id="desk-category" select size="small" label="Category" value={category ?? ""} onChange={(e) => setCategoryFilter(e.target.value || null)} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 190 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
                    <MenuItem value="">{`All categories · ${total}`}</MenuItem>
                    {desk.categories.map((c) => <MenuItem key={c.id} value={c.id}>{`${c.name} · ${c.count}`}</MenuItem>)}
                  </TextField>
                )}
                {priorities.length > 1 && (
                  <TextField id="desk-priority" select size="small" label="Priority" value={priority ?? ""} onChange={(e) => setPriorityFilter(e.target.value || null)} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 190 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
                    <MenuItem value="">All priorities</MenuItem>
                    {priorities.map((p) => (
                      <MenuItem key={p.id} value={p.id}>
                        <Box component="span" aria-hidden sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: p.colour, mr: 1, display: "inline-block" }} />{`${p.name} · ${p.count}`}
                      </MenuItem>
                    ))}
                  </TextField>
                )}
                {sectionFilter && <Chip label={`Only ${SECTION_LABEL[sectionFilter]}`} onDelete={() => setSectionFilter(null)} />}
              </>
            }
          />

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
                    {isOpen(s) && <DayGroups label={SECTION_LABEL[s]} today={desk.today} items={rows.map((t) => ({ task: t, section: s }))} render={(t, sec) => <TaskRow key={t.id} {...rowProps(t, sec)} />} />}
                  </Box>
                </Box>
              );
            })
          ) : (
            blocks.map((b) => {
              if (b.parked) {
                const lateParked = b.tasks.filter(({ task }) => task.due_date !== null && daysUntil(task.due_date, desk.today) < 0).length;
                const note = `chased, back later${lateParked > 0 ? `; ${lateParked} already late` : ""}`;
                return (
                  <Box component="section" key={b.id} sx={{ mb: 3 }}>
                    <SectionHeader section="parked" count={b.tasks.length} note={note} open={isOpen("parked")} onToggle={() => setExpanded((e) => ({ ...e, parked: !isOpen("parked") }))} />
                    <Box id="desk-section-parked" hidden={!isOpen("parked")}>
                      {isOpen("parked") && <DayGroups label={b.name} today={desk.today} items={b.tasks} render={(t, sec) => <TaskRow key={t.id} {...rowProps(t, sec)} showCategory />} />}
                    </Box>
                  </Box>
                );
              }
              return (
                <Box component="section" key={b.id} sx={{ mb: 3 }}>
                  <Typography component="h2" variant="subtitle2" sx={{ display: "flex", alignItems: "center", gap: 1, mb: 1, py: 0.5, fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", color: "text.secondary" }}>
                    <Box component="span" aria-hidden sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: b.colour }} />
                    {b.name}
                    <Chip size="small" label={b.tasks.length} sx={{ height: 20 }} />
                  </Typography>
                  <DayGroups label={b.name} today={desk.today} items={b.tasks} render={(t, sec) => <TaskRow key={t.id} {...rowProps(t, sec)} />} />
                </Box>
              );
            })
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

      {confirming && (() => {
        const { task: t, kind } = confirming;
        const contacting = kind === "done" && t.origin === "auto" && t.source_type === "demo_request";
        const copy = {
          done: { title: contacting ? "Mark as contacted?" : "Mark this task done?", text: contacting ? "The demo request is marked contacted and this task leaves the Desk." : "It leaves the Desk and moves to Closed. You can reopen it later.", action: contacting ? "Mark contacted" : "Mark done" },
          take: { title: "Take this task?", text: "It will be assigned to you.", action: "Take it" },
          in_progress: { title: "Mark as in progress?", text: "The task stays on the Desk with the status In progress.", action: "Mark in progress" },
        }[kind];
        return (
          <Dialog open onClose={() => setConfirming(null)} maxWidth="xs" fullWidth>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogContent>
              <DialogContentText>&ldquo;{t.title}&rdquo;. {copy.text}</DialogContentText>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirming(null)}>Not now</Button>
              <Button id="task-confirm" variant="contained" autoFocus onClick={() => runConfirmed(confirming)}>{copy.action}</Button>
            </DialogActions>
          </Dialog>
        );
      })()}

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
