"use client";
import { useMemo, useState } from "react";
import Autocomplete, { createFilterOptions } from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import MenuItem from "@mui/material/MenuItem";
import { ApiError } from "@/lib/api-client";
import { OPTION_FIELDS, optionField, type FieldOption } from "../registry";
import { useOptions } from "./useOptions";

interface Item {
  key: string;
  label: string;
  isNew?: boolean;
}
const filter = createFilterOptions<Item>();

interface Props {
  table: string;
  column: string;
  value: string;
  onChange: (key: string) => void;
  label: string;
  required?: boolean;
  disabled?: boolean;
  size?: "small" | "medium";
  error?: string;
  helperText?: string;
}

/** A dropdown whose list lives in field_options. Typing a name that doesn't exist offers "+ Add". */
export function OptionSelect({ table, column, value, onChange, label, required, disabled, size, error, helperText }: Props) {
  const { options, add, labelOf } = useOptions(table, column);
  const [busy, setBusy] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const noun = optionField(table, column) ? OPTION_FIELDS[optionField(table, column)!].noun : "option";

  const items = useMemo<Item[]>(() => options.map((o: FieldOption) => ({ key: o.option_key, label: o.option_value })), [options]);
  // Must keep the same identity between renders, or MUI resets the input on every keystroke and loops.
  // A record may hold an option that has since been hidden; keep showing it.
  const selected = useMemo<Item | null>(
    () => (value ? items.find((i) => i.key.toLowerCase() === value.toLowerCase()) ?? { key: value, label: labelOf(value) } : null),
    [items, value, labelOf],
  );

  async function pick(item: Item | null) {
    setAddError(null);
    if (!item) return onChange("");
    if (!item.isNew) return onChange(item.key);
    setBusy(true);
    try {
      const created = await add(item.label);
      onChange(created.option_key);
    } catch (e) {
      setAddError(e instanceof ApiError ? e.message : "Could not add the option");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Autocomplete<Item>
      value={selected}
      options={items}
      disabled={disabled || busy}
      size={size}
      loading={busy}
      autoHighlight
      selectOnFocus
      handleHomeEndKeys
      clearOnBlur
      isOptionEqualToValue={(a, b) => a.key.toLowerCase() === b.key.toLowerCase()}
      getOptionLabel={(o) => o.label}
      filterOptions={(opts, params) => {
        const out = filter(opts, params);
        const typed = params.inputValue.trim();
        if (typed && !opts.some((o) => o.label.toLowerCase() === typed.toLowerCase())) {
          out.push({ key: `__new__${typed}`, label: typed, isNew: true });
        }
        return out;
      }}
      onChange={(_, v) => void pick(v as Item | null)}
      renderOption={(props, o) => {
        const { key, ...rest } = props as typeof props & { key: string };
        return <li key={key} {...rest}>{o.isNew ? `+ Add “${o.label}”` : o.label}</li>;
      }}
      renderInput={(params) => (
        <TextField {...params} label={label} required={required} error={Boolean(error || addError)} helperText={addError ?? error ?? helperText ?? `Type to search, or add a new ${noun}`} />
      )}
    />
  );
}

/** Plain filter dropdown ("All" + the active options) for list pages. */
export function OptionFilter({ table, column, value, onChange, label, minWidth = 160 }: { table: string; column: string; value: string; onChange: (key: string) => void; label: string; minWidth?: number }) {
  const { options } = useOptions(table, column);
  return (
    <TextField select size="small" label={label} value={value} onChange={(e) => onChange(e.target.value)} sx={{ minWidth }}>
      <MenuItem value=""><em>All</em></MenuItem>
      {options.map((o) => <MenuItem key={o.id} value={o.option_key}>{o.option_value}</MenuItem>)}
    </TextField>
  );
}

/** Shows the label for a stored key. */
export function OptionLabel({ table, column, value }: { table: string; column: string; value: string | null | undefined }) {
  const { labelOf } = useOptions(table, column);
  return <>{labelOf(value) || "—"}</>;
}
