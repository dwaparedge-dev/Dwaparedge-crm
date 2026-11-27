"use client";
import { useState } from "react";
import NextLink from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Link from "@mui/material/Link";
import MenuItem from "@mui/material/MenuItem";
import TextField from "@mui/material/TextField";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import Typography from "@mui/material/Typography";
import type { GridColDef } from "@mui/x-data-grid";
import { ClientPicker } from "@/components/common/ClientPicker";
import { DataTable } from "@/components/common/DataTable";
import { ListLayout } from "@/components/common/ListLayout";
import { PageHeader } from "@/components/common/PageHeader";
import { SegmentedTabs } from "@/components/common/SegmentedTabs";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { useCurrentUser } from "@/components/layout/CurrentUserContext";
import { daysUntil, todayIST } from "@/lib/dates";
import type { CategoryRow, PriorityRow } from "../config-service";
import { dueText, formatWhen, shortDate } from "../display";
import { apiQuery, hasNarrowingFilters, type StatusFilter, type TaskListFilters } from "../list-filters";
import { canViewAll } from "../policy";
import type { TaskRow as TaskData } from "../queries";
import { TASK_STATUSES } from "../schema";
import { useTaskFilters } from "../useTaskFilters";
import { CategoryChip, PriorityChip, STATUS_LABEL } from "./common";
import { TaskCardList } from "./TaskCardList";
import { TaskDetailPanel } from "./TaskDetailPanel";

interface ListResponse { items: TaskData[]; total: number; page: number; pageSize: number }
interface Option { id: string; name: string }

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "closed", label: "Closed" },
  ...TASK_STATUSES.map((s) => ({ value: s, label: STATUS_LABEL[s] })),
];

const isStatusFilter = (v: string): v is StatusFilter => STATUS_TABS.some((t) => t.value === v);

/** The picked id stays in the list even when the list does not hold it (still loading, or a bookmark of a row that is gone), so a select is never blank while its filter is on. */
function withSelected(items: Option[], id: string, loaded: boolean, missing: string): Option[] {
  return id && !items.some((o) => o.id === id) ? [...items, { id, name: loaded ? missing : "Loading…" }] : items;
}

function emptyText(f: TaskListFilters, pastTheEnd: boolean): { title: string; hint: string } {
  // A bookmarked page number can outlast the tasks it listed: the list is not empty, the page is.
  if (pastTheEnd) return { title: "No tasks on this page", hint: "There are fewer tasks now than when this view was saved." };
  if (hasNarrowingFilters(f)) return { title: "No tasks match your filters", hint: "Try different filters, or clear them." };
  if (f.status === "active") return { title: "No active tasks", hint: "Nothing is open, in progress or waiting." };
  if (f.status === "closed") return { title: "No closed tasks", hint: "Tasks you finish or cancel are listed here." };
  return { title: `No ${STATUS_LABEL[f.status].toLowerCase()} tasks`, hint: "Try another status." };
}

/** Every task, filtered the way you need it, for when the Desk is not enough. The filters live in the address bar. Spec section 4. */
export function AllTasksList() {
  const user = useCurrentUser();
  const seeAll = canViewAll(user);
  const { filters, update, clear, text, setText, resetCount } = useTaskFilters();
  const [openId, setOpenId] = useState<string | null>(null);
  // Under 900px wide the table is a list of cards: eight columns do not fit a phone.
  const compact = useMediaQuery(useTheme().breakpoints.down("md"));

  const categories = useFetch<{ items: CategoryRow[] }>("/api/task-categories?all=true");
  const priorities = useFetch<{ items: PriorityRow[] }>("/api/task-priorities?all=true");
  const staff = useFetch<{ items: Option[] }>(seeAll ? "/api/users/options" : null);
  const { data, error, loading, reload } = useFetch<ListResponse>(`/api/tasks?${apiQuery(filters, seeAll ? "all" : "mine")}`);

  const today = todayIST();

  const categoryOptions = withSelected((categories.data?.items ?? []).map((c) => ({ id: c.id, name: c.is_active ? c.name : `${c.name} (hidden)` })), filters.categoryId, Boolean(categories.data), "Unknown category");
  const priorityOptions = withSelected((priorities.data?.items ?? []).map((p) => ({ id: p.id, name: p.is_active ? p.name : `${p.name} (hidden)` })), filters.priorityId, Boolean(priorities.data), "Unknown priority");
  const ownerOptions = withSelected(
    (staff.data?.items ?? []).map((s) => ({ id: s.id, name: s.id === user.id ? `${s.name} (me)` : s.name })),
    filters.ownerId === "unassigned" ? "" : filters.ownerId, Boolean(staff.data), "Unknown person",
  );

  const defs: GridColDef<TaskData>[] = [
    {
      field: "title", headerName: "Task", minWidth: 280, flex: 2,
      renderCell: ({ row: t }) => (
        <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
          <Link
            component="button" type="button" underline="hover" onClick={() => setOpenId(t.id)} aria-haspopup="dialog"
            sx={{ minWidth: 0, textAlign: "left", fontWeight: 600, color: "text.primary", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {t.title}
          </Link>
          {t.origin === "auto" && <Chip size="small" variant="outlined" label="auto" />}
        </Box>
      ),
    },
    {
      field: "status", headerName: "Status", width: 130,
      renderCell: ({ row: t }) => <Chip size="small" variant="outlined" color={t.status === "done" ? "success" : "default"} label={STATUS_LABEL[t.status]} />,
    },
    { field: "priority_name", headerName: "Priority", width: 130, renderCell: ({ row: t }) => <PriorityChip name={t.priority_name} colour={t.priority_colour} /> },
    { field: "category_name", headerName: "Category", width: 190, renderCell: ({ row: t }) => <CategoryChip name={t.category_name} colour={t.category_colour} /> },
    { field: "owner_name", headerName: "Owner", width: 150, valueFormatter: (v: string | null) => v ?? "Unassigned" },
    { field: "client_name", headerName: "Client", minWidth: 180, valueFormatter: (v: string | null) => v ?? "—" },
    {
      field: "due_date", headerName: "Due", width: 150,
      renderCell: ({ row: t }) => {
        if (t.due_date === null) return <Typography variant="body2" color="text.secondary">—</Typography>;
        // A task that is done or cancelled is not late, whatever its due date says, so it shows the date alone.
        const closed = t.status === "done" || t.status === "cancelled";
        const late = !closed && daysUntil(t.due_date, today) < 0;
        return (
          <Box>
            <Typography variant="body2">{shortDate(t.due_date)}</Typography>
            {!closed && <Typography variant="caption" sx={late ? { color: "error.main", fontWeight: 600 } : { color: "text.secondary" }}>{dueText(t.due_date, today)}</Typography>}
          </Box>
        );
      },
    },
    { field: "updated_at", headerName: "Updated", width: 190, valueFormatter: (v: string) => formatWhen(v) },
  ];
  // The server orders the list, so a click on a header must not reorder just the page in view.
  const columns = defs.map((c) => ({ ...c, sortable: false }));

  const pastTheEnd = data !== null && data.total > 0 && data.items.length === 0;
  const empty = emptyText(filters, pastTheEnd);

  return (
    <>
      <PageHeader
        title="All tasks" subtitle="Every task, filtered the way you need it. Today's work lives on the Desk."
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Desk", href: "/tasks" }, { label: "All tasks" }]}
        actions={<Button component={NextLink} href="/tasks" variant="outlined">Open the Desk</Button>}
      />
      <ListLayout
        onRefresh={reload} refreshing={loading}
        search={{ value: text, onChange: setText, placeholder: "Search title and description", label: "Search tasks" }}
        filters={
          <>
            <TextField select size="small" label="Category" value={filters.categoryId} onChange={(e) => update({ categoryId: e.target.value })} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 170 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
              <MenuItem value="">All categories</MenuItem>
              {categoryOptions.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
            </TextField>
            <TextField select size="small" label="Priority" value={filters.priorityId} onChange={(e) => update({ priorityId: e.target.value })} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 150 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
              <MenuItem value="">All priorities</MenuItem>
              {priorityOptions.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
            </TextField>
            {seeAll && (
              <TextField select size="small" label="Owner" value={filters.ownerId} onChange={(e) => update({ ownerId: e.target.value })} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 170 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
                <MenuItem value="">Anyone</MenuItem>
                <MenuItem value="unassigned">Unassigned</MenuItem>
                {ownerOptions.map((o) => <MenuItem key={o.id} value={o.id}>{o.name}</MenuItem>)}
              </TextField>
            )}
            <TextField select size="small" label="Source" value={filters.origin} onChange={(e) => update({ origin: e.target.value as TaskListFilters["origin"] })} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 170 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}>
              <MenuItem value="">Any source</MenuItem>
              <MenuItem value="manual">Added by hand</MenuItem>
              <MenuItem value="auto">Raised by the CRM</MenuItem>
            </TextField>
            <Box sx={{ minWidth: { xs: "100%", sm: 220 } }}>
              <ClientPicker key={resetCount} size="small" required={false} value={filters.clientId} onChange={(id) => update({ clientId: id })} />
            </Box>
            <TextField
              type="date" size="small" label="Due from" value={filters.dueFrom} onChange={(e) => update({ dueFrom: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 160 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}
            />
            <TextField
              type="date" size="small" label="Due to" value={filters.dueTo} onChange={(e) => update({ dueTo: e.target.value })}
              slotProps={{ inputLabel: { shrink: true } }} sx={{ minWidth: { xs: "calc(50% - 6px)", sm: 160 }, flex: { xs: "1 1 calc(50% - 6px)", sm: "0 0 auto" } }}
            />
            {hasNarrowingFilters(filters) && <Button size="small" onClick={clear}>Clear filters</Button>}
          </>
        }
        tabs={<SegmentedTabs label="Task status" value={filters.status} onChange={(v) => { if (isStatusFilter(v)) update({ status: v }); }} tabs={STATUS_TABS} />}
      >
        {error ? <Box sx={{ p: 2 }}><ErrorState message={error} onRetry={reload} /></Box> : (
          (() => {
            const emptyAction = pastTheEnd ? <Button variant="outlined" onClick={() => update({ page: 1 })}>Back to the first page</Button>
              : hasNarrowingFilters(filters) ? <Button variant="outlined" onClick={clear}>Clear filters</Button> : undefined;
            return compact ? (
              <TaskCardList
                rows={data?.items ?? []} total={data?.total ?? 0} loading={loading} page={filters.page} pageSize={filters.pageSize} today={today}
                onPage={(p) => update({ page: p })} onOpen={(t) => setOpenId(t.id)} emptyTitle={empty.title} emptyHint={empty.hint} emptyAction={emptyAction}
              />
            ) : (
              <DataTable<TaskData>
                label="Tasks" rows={data?.items ?? []} columns={columns} total={data?.total ?? 0} loading={loading}
                page={filters.page - 1} pageSize={filters.pageSize} onPageChange={(p, size) => update({ page: p + 1, pageSize: size })}
                onRowClick={(t) => setOpenId(t.id)}
                emptyTitle={empty.title} emptyHint={empty.hint} emptyAction={emptyAction}
              />
            );
          })()
        )}
      </ListLayout>
      {openId && <TaskDetailPanel key={openId} taskId={openId} today={today} onClose={() => setOpenId(null)} onChanged={reload} />}
    </>
  );
}
