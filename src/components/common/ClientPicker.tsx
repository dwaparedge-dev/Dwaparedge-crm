"use client";
import { autocompleteLoading } from "@/components/common/loading";
import { useEffect, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import TextField from "@mui/material/TextField";
import { api } from "@/lib/api-client";

export interface ClientOption {
  id: string;
  display_name: string;
  gstin: string | null;
}

interface Props {
  value: string;
  onChange: (id: string, option: ClientOption | null) => void;
  disabled?: boolean;
  error?: string;
}

/** Searchable client selector (server-side search, active clients only). */
export function ClientPicker({ value, onChange, disabled, error }: Props) {
  const [options, setOptions] = useState<ClientOption[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ClientOption | null>(null);

  // Resolve the label for a preselected id.
  useEffect(() => {
    if (!value || selected?.id === value) return;
    api<ClientOption>(`/api/clients/${value}`).then(setSelected).catch(() => undefined);
  }, [value, selected?.id]);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      setLoading(true);
      api<{ items: ClientOption[] }>(`/api/clients?pageSize=20&search=${encodeURIComponent(input)}`)
        .then((d) => !cancelled && setOptions(d.items))
        .catch(() => !cancelled && setOptions([]))
        .finally(() => !cancelled && setLoading(false));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input]);

  return (
    <Autocomplete
      options={selected && !options.some((o) => o.id === selected.id) ? [selected, ...options] : options}
      value={selected}
      loading={loading}
      disabled={disabled}
      filterOptions={(x) => x}
      getOptionLabel={(o) => o.display_name}
      isOptionEqualToValue={(a, b) => a.id === b.id}
      onInputChange={(_, v, reason) => reason !== "reset" && setInput(v)}
      onChange={(_, o) => {
        setSelected(o);
        onChange(o?.id ?? "", o);
      }}
      renderOption={(props, o) => (
        <li {...props} key={o.id}>
          {o.display_name}
          {o.gstin && <span style={{ marginLeft: 8, opacity: 0.6, fontSize: 12 }}>{o.gstin}</span>}
        </li>
      )}
      renderInput={(params) => <TextField {...params} slotProps={autocompleteLoading(params, loading)} label="Client" required error={Boolean(error)} helperText={error} />}
    />
  );
}
