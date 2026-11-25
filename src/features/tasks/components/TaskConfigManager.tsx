"use client";
import { useRef, useState } from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import IconButton from "@mui/material/IconButton";
import Skeleton from "@mui/material/Skeleton";
import Switch from "@mui/material/Switch";
import TextField from "@mui/material/TextField";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DeleteOutlineIcon from "@mui/icons-material/DeleteOutlined";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { EmptyState, ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { ApiError, api } from "@/lib/api-client";
import type { CategoryRow, ConfigKind, PriorityRow } from "../config-service";
import { deleteBlockedReason, moveRow } from "../config-view";

// One screen for both lists, because they behave the same way (spec section 6): rename, recolour, reorder, hide, delete where
// allowed, add. They differ in one number: a category's default follow-up days, a priority's rank.
//
// Nothing here has to tell other screens to refresh. The Desk, the All tasks filters and the task form each read these lists
// when they open and keep no copy (unlike the dropdown options, which share a cache), so the next time one opens it has the change.

type Row = CategoryRow | PriorityRow;

const COPY: Record<ConfigKind, { url: string; noun: "category" | "priority"; Noun: string; intro: string; numberLabel: string; numberHelp: string }> = {
  categories: {
    url: "/api/task-categories",
    noun: "category",
    Noun: "Category",
    intro: "Categories group tasks on the Desk. Rename or recolour them freely; hide one to stop offering it without losing the tasks already in it. Follow-up days is how long a task waits after you chase it; leave it blank for no repeat.",
    numberLabel: "Follow-up (days)",
    numberHelp: "After you chase a task, bring it back after this many days. Blank means no repeat.",
  },
  priorities: {
    url: "/api/task-priorities",
    noun: "priority",
    Noun: "Priority",
    intro: "Priorities say how important a task is. Rank decides the order inside each Desk section (1 is the most urgent). The order in this list is only the order in the dropdowns.",
    numberLabel: "Rank",
    numberHelp: "1 is the most urgent, up to 99.",
  },
};

const NEW_COLOUR = "#64748b";

/** The server's own message for a refused field ("Name is required"), else the error's text. */
const errorText = (e: unknown, fallback: string) =>
  e instanceof ApiError && e.details?.issues?.[0] ? e.details.issues[0].message : e instanceof Error ? e.message : fallback;

/** Text that follows a value from the server: it starts as the value, and starts again whenever the server's value changes (after a save, a reorder or a reload). */
function useFollowing(value: string) {
  const [text, setText] = useState(value);
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    setSeen(value);
    setText(value);
  }
  return [text, setText] as const;
}

/** Whole number in `[min, max]`; blank is `null` when allowed. `undefined` when it is not a valid entry. */
function wholeNumber(text: string, min: number, max: number, allowBlank: boolean): number | null | undefined {
  const t = text.trim();
  if (t === "") return allowBlank ? null : undefined;
  if (!/^\d+$/.test(t)) return undefined;
  const n = Number(t);
  return n >= min && n <= max ? n : undefined;
}

const colourSx = { width: 38, height: 34, p: 0, border: "1px solid", borderColor: "divider", borderRadius: 1, bgcolor: "transparent", cursor: "pointer", flexShrink: 0 } as const;

interface RowProps {
  kind: ConfigKind;
  row: Row;
  first: boolean;
  last: boolean;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onChanged: () => void;
}

function ConfigRow({ kind, row, first, last, onMove, onDelete, onChanged }: RowProps) {
  const notify = useNotify();
  const copy = COPY[kind];
  const isCategory = kind === "categories";
  const serverNumber = isCategory ? ((row as CategoryRow).default_follow_up_days?.toString() ?? "") : String((row as PriorityRow).rank);

  const [name, setName] = useFollowing(row.name);
  const [colour, setColour] = useFollowing(row.colour);
  const [number, setNumber] = useFollowing(serverNumber);
  const [numberError, setNumberError] = useState<string | null>(null);
  const colourTimer = useRef<number | undefined>(undefined);

  /** Saves what changed. On a refusal the fields go back to what the server holds, and the message says why. */
  async function patch(body: Record<string, unknown>) {
    try {
      await api(`${copy.url}/${row.id}`, { method: "PATCH", body });
      onChanged();
    } catch (e) {
      setName(row.name);
      setColour(row.colour);
      setNumber(serverNumber);
      notify.error(errorText(e, "Could not save"));
    }
  }

  function saveName() {
    const v = name.trim();
    if (v && v !== row.name) void patch({ name: v });
    else setName(row.name);
  }

  function saveNumber() {
    const n = isCategory ? wholeNumber(number, 1, 365, true) : wholeNumber(number, 1, 99, false);
    if (n === undefined) {
      setNumberError(isCategory ? "Whole days, 1 to 365" : "Whole number, 1 to 99");
      return;
    }
    setNumberError(null);
    if (String(n ?? "") === serverNumber) {
      setNumber(serverNumber);
      return;
    }
    void patch(isCategory ? { defaultFollowUpDays: n } : { rank: n });
  }

  // The colour picker reports every shade while it is dragged, so the save waits until it has been still for a moment.
  function pickColour(v: string) {
    setColour(v);
    window.clearTimeout(colourTimer.current);
    colourTimer.current = window.setTimeout(() => { if (v !== row.colour) void patch({ colour: v }); }, 600);
  }

  const blocked = deleteBlockedReason(row, copy.noun);

  return (
    <Box
      component="li" aria-label={row.name}
      sx={{ listStyle: "none", display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1, py: 1, borderBottom: "1px solid", borderColor: "divider", "&:last-of-type": { borderBottom: 0 }, opacity: row.is_active ? 1 : 0.65 }}
    >
      <Box component="input" type="color" value={colour} onChange={(e: React.ChangeEvent<HTMLInputElement>) => pickColour(e.target.value)} aria-label={`Colour of ${row.name}`} sx={{ ...colourSx, mt: 0.5 }} />
      <TextField
        size="small" label="Name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        sx={{ flex: "1 1 200px", maxWidth: 320 }} slotProps={{ htmlInput: { maxLength: 60 } }}
      />
      <TextField
        size="small" label={copy.numberLabel} value={number} onChange={(e) => setNumber(e.target.value)} onBlur={saveNumber}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLInputElement).blur(); } }}
        error={numberError !== null} helperText={numberError ?? undefined} sx={{ width: 150 }}
        slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 3 } }}
      />
      <Box sx={{ display: "flex", alignItems: "center", gap: 0.5, flexWrap: "wrap", mt: 0.25 }}>
        {row.is_system && <Chip size="small" label="Starter" />}
        {row.in_use && !row.is_system && <Chip size="small" label="In use" variant="outlined" />}
        <Tooltip title={row.is_active ? `Shown in dropdowns. Switch off to hide this ${copy.noun}.` : `Hidden from dropdowns. Switch on to show this ${copy.noun} again.`}>
          <Switch checked={row.is_active} onChange={(e) => void patch({ isActive: e.target.checked })} slotProps={{ input: { "aria-label": `Shown in dropdowns: ${row.name}` } }} />
        </Tooltip>
        <IconButton size="small" disabled={first} onClick={() => onMove(-1)} aria-label={`Move ${row.name} up`}><ArrowUpwardIcon fontSize="small" /></IconButton>
        <IconButton size="small" disabled={last} onClick={() => onMove(1)} aria-label={`Move ${row.name} down`}><ArrowDownwardIcon fontSize="small" /></IconButton>
        <Tooltip title={blocked ?? "Delete"}>
          <span><IconButton size="small" disabled={blocked !== null} onClick={onDelete} aria-label={`Delete ${row.name}`}><DeleteOutlineIcon fontSize="small" /></IconButton></span>
        </Tooltip>
      </Box>
    </Box>
  );
}

function AddRow({ kind, rows, onAdded }: { kind: ConfigKind; rows: Row[]; onAdded: () => void }) {
  const notify = useNotify();
  const copy = COPY[kind];
  const isCategory = kind === "categories";
  const [name, setName] = useState("");
  const [colour, setColour] = useState(NEW_COLOUR);
  const [number, setNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const nextRank = Math.min(99, Math.max(0, ...rows.map((r) => (r as PriorityRow).rank ?? 0)) + 1);

  async function add() {
    const label = name.trim();
    if (!label) return;
    const n = isCategory ? wholeNumber(number, 1, 365, true) : number.trim() === "" ? nextRank : wholeNumber(number, 1, 99, false);
    if (n === undefined) {
      notify.error(isCategory ? "Follow-up days must be a whole number from 1 to 365, or blank" : "Rank must be a whole number from 1 to 99");
      return;
    }
    setBusy(true);
    try {
      await api(copy.url, { method: "POST", body: isCategory ? { name: label, colour, ...(n === null ? {} : { defaultFollowUpDays: n }) } : { name: label, colour, rank: n } });
      notify.success(`${copy.Noun} added`);
      setName("");
      setNumber("");
      onAdded();
    } catch (e) {
      notify.error(errorText(e, `Could not add the ${copy.noun}`));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box sx={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", gap: 1, mt: 2 }}>
      <Box component="input" type="color" value={colour} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setColour(e.target.value)} aria-label={`Colour of the new ${copy.noun}`} sx={{ ...colourSx, mt: 0.5 }} />
      <TextField
        size="small" label={`New ${copy.noun}`} value={name} onChange={(e) => setName(e.target.value)} disabled={busy}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
        sx={{ flex: "1 1 200px", maxWidth: 320 }} slotProps={{ htmlInput: { maxLength: 60 } }}
      />
      <TextField
        size="small" label={copy.numberLabel} value={number} onChange={(e) => setNumber(e.target.value)} disabled={busy}
        onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }}
        placeholder={isCategory ? "" : String(nextRank)} helperText={copy.numberHelp} sx={{ width: 150 }}
        slotProps={{ htmlInput: { inputMode: "numeric", maxLength: 3 } }}
      />
      <Button variant="outlined" onClick={() => void add()} disabled={busy || !name.trim()} sx={{ mt: 0.25 }}>{busy ? "Adding…" : "Add"}</Button>
    </Box>
  );
}

/** Settings screen for task categories (`kind="categories"`) or task priorities (`kind="priorities"`). The server checks tasks.manage_settings on every change. */
export function TaskConfigManager({ kind }: { kind: ConfigKind }) {
  const notify = useNotify();
  const copy = COPY[kind];
  // `all=true` brings the hidden rows too, so they can be shown again.
  const { data, error, loading, reload } = useFetch<{ items: Row[] }>(`${copy.url}?all=true`);
  const [deleting, setDeleting] = useState<Row | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  if (error && !data) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton variant="rounded" height={420} />;
  const rows = data?.items ?? [];

  async function move(index: number, dir: -1 | 1) {
    const changes = moveRow(rows, index, dir);
    if (!changes.length) return;
    try {
      await Promise.all(changes.map((c) => api(`${copy.url}/${c.id}`, { method: "PATCH", body: { sortOrder: c.sortOrder } })));
    } catch (e) {
      notify.error(errorText(e, "Could not reorder"));
    } finally {
      reload(); // also after a failure, so the list shows what the server holds
    }
  }

  async function remove(row: Row) {
    setDeleteBusy(true);
    try {
      await api(`${copy.url}/${row.id}`, { method: "DELETE" });
      notify.success(`${copy.Noun} deleted`);
      setDeleting(null);
    } catch (e) {
      notify.error(errorText(e, `Could not delete the ${copy.noun}`));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
      reload();
    }
  }

  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>{copy.intro}</Alert>
      {error && <Box sx={{ mb: 2 }}><ErrorState message={error} onRetry={reload} /></Box>}
      <Card sx={{ mb: 2 }}>
        <CardContent aria-busy={loading}>
          <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>{kind === "categories" ? "Task categories" : "Task priorities"}</Typography>
          {rows.length === 0 ? <EmptyState title={`No ${kind} yet`} /> : (
            <Box component="ul" aria-label={kind === "categories" ? "Task categories" : "Task priorities"} sx={{ m: 0, p: 0 }}>
              {rows.map((r, i) => (
                <ConfigRow
                  key={r.id} kind={kind} row={r} first={i === 0} last={i === rows.length - 1}
                  onMove={(dir) => void move(i, dir)} onDelete={() => setDeleting(r)} onChanged={reload}
                />
              ))}
            </Box>
          )}
          <AddRow kind={kind} rows={rows} onAdded={reload} />
        </CardContent>
      </Card>
      <ConfirmDialog
        open={deleting !== null} title={`Delete ${copy.noun}?`} destructive confirmLabel="Delete" busy={deleteBusy}
        message={deleting ? `"${deleting.name}" will be removed. No task uses it, so nothing else changes.` : ""}
        onConfirm={() => { if (deleting) void remove(deleting); }} onClose={() => setDeleting(null)}
      />
    </>
  );
}
