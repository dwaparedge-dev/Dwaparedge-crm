"use client";
import { useState } from "react";
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
import { useNotify } from "@/components/common/Notify";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import { OPTION_FIELDS, type FieldOption, type OptionFieldKey } from "../registry";
import { refreshOptions } from "./useOptions";

interface FieldGroup {
  field: OptionFieldKey;
  title: string;
  options: FieldOption[];
}

function Row({ o, first, last, onMove, onChanged }: { o: FieldOption; first: boolean; last: boolean; onMove: (dir: -1 | 1) => void; onChanged: () => void }) {
  const notify = useNotify();
  const [name, setName] = useState(o.option_value);

  async function patch(body: Record<string, unknown>) {
    try {
      await api(`/api/options/${o.id}`, { method: "PATCH", body });
      refreshOptions();
      onChanged();
    } catch (e) {
      setName(o.option_value);
      notify.error(e instanceof Error ? e.message : "Could not save");
    }
  }
  async function remove() {
    try {
      await api(`/api/options/${o.id}`, { method: "DELETE" });
      refreshOptions();
      onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not delete");
    }
  }
  const canDelete = !o.is_system && !o.in_use;
  return (
    <Box sx={{ display: "flex", alignItems: "center", gap: 1, py: 0.5 }}>
      <TextField
        size="small"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => { const v = name.trim(); if (v && v !== o.option_value) void patch({ label: v }); else setName(o.option_value); }}
        sx={{ flex: 1, maxWidth: 360 }}
        slotProps={{ htmlInput: { maxLength: 60, "aria-label": "Option name" } }}
      />
      {o.is_system && <Chip size="small" label="Built-in" />}
      {o.in_use && !o.is_system && <Chip size="small" label="In use" variant="outlined" />}
      <Tooltip title={o.is_active ? "Shown in dropdowns" : "Hidden from dropdowns"}>
        <Switch checked={o.is_active} onChange={(e) => void patch({ isActive: e.target.checked })} slotProps={{ input: { "aria-label": "Active" } }} />
      </Tooltip>
      <IconButton size="small" disabled={first} onClick={() => onMove(-1)} aria-label="Move up"><ArrowUpwardIcon fontSize="small" /></IconButton>
      <IconButton size="small" disabled={last} onClick={() => onMove(1)} aria-label="Move down"><ArrowDownwardIcon fontSize="small" /></IconButton>
      <Tooltip title={canDelete ? "Delete" : o.is_system ? "Built-in options can be hidden, not deleted" : "Used by existing records. Hide it instead."}>
        <span><IconButton size="small" disabled={!canDelete} onClick={() => void remove()} aria-label="Delete"><DeleteOutlineIcon fontSize="small" /></IconButton></span>
      </Tooltip>
    </Box>
  );
}

function Group({ g, onChanged }: { g: FieldGroup; onChanged: () => void }) {
  const notify = useNotify();
  const [table, column] = g.field.split(".") as [string, string];
  const [label, setLabel] = useState("");

  async function add() {
    if (!label.trim()) return;
    try {
      await api("/api/options", { method: "POST", body: { table, column, label } });
      setLabel("");
      refreshOptions();
      onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not add");
    }
  }
  async function move(i: number, dir: -1 | 1) {
    const a = g.options[i]!;
    const b = g.options[i + dir]!;
    // Swap positions; ties (equal sort_order) are broken by giving them distinct values.
    const [sa, sb] = a.sort_order === b.sort_order ? [b.sort_order + dir, a.sort_order] : [b.sort_order, a.sort_order];
    try {
      await Promise.all([api(`/api/options/${a.id}`, { method: "PATCH", body: { sortOrder: Math.max(0, sa) } }), api(`/api/options/${b.id}`, { method: "PATCH", body: { sortOrder: Math.max(0, sb) } })]);
      refreshOptions();
      onChanged();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not reorder");
    }
  }

  return (
    <Card sx={{ mb: 2 }}>
      <CardContent>
        <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{g.title}</Typography>
        <Typography variant="caption" color="text.secondary" component="div" sx={{ mb: 1 }}>
          Used on {table.replace("_", " ")} · {column}. Renaming changes the label everywhere; saved records keep their value.
        </Typography>
        {g.options.map((o, i) => <Row key={o.id + o.option_value} o={o} first={i === 0} last={i === g.options.length - 1} onMove={(d) => void move(i, d)} onChanged={onChanged} />)}
        <Box sx={{ display: "flex", gap: 1, mt: 1.5 }}>
          <TextField size="small" label={`Add ${OPTION_FIELDS[g.field].noun}`} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); void add(); } }} sx={{ maxWidth: 360, flex: 1 }} slotProps={{ htmlInput: { maxLength: 60 } }} />
          <Button variant="outlined" onClick={() => void add()} disabled={!label.trim()}>Add</Button>
        </Box>
      </CardContent>
    </Card>
  );
}

export function OptionsManager() {
  const { data, error, loading, reload } = useFetch<{ fields: FieldGroup[] }>("/api/options");
  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading && !data) return <Skeleton variant="rounded" height={420} />;
  return (
    <>
      <Alert severity="info" sx={{ mb: 2 }}>These lists fill the dropdowns across the app. You can also add a new option straight from any dropdown by typing it. Hide an option to stop offering it without losing old records.</Alert>
      {data?.fields.map((g) => <Group key={g.field} g={g} onChanged={reload} />)}
    </>
  );
}
