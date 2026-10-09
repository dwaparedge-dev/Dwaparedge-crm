"use client";
import { useMemo, useState } from "react";
import Autocomplete from "@mui/material/Autocomplete";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import SearchIcon from "@mui/icons-material/SearchRounded";
import { NAV_ITEMS } from "./nav";

/** Quick jump to any page of the app. (Searching records comes later.) */
export function PageSearch({ onNavigate }: { onNavigate: (href: string) => void }) {
  const [input, setInput] = useState("");
  const options = useMemo(() => NAV_ITEMS.filter((i) => i.ready), []);
  return (
    <Autocomplete
      size="small"
      options={options}
      value={null}
      inputValue={input}
      onInputChange={(_, v) => setInput(v)}
      getOptionLabel={(o) => o.label}
      onChange={(_, o) => { if (o) { setInput(""); onNavigate(o.href); } }}
      blurOnSelect
      clearOnBlur
      noOptionsText="No matching page"
      sx={{ width: { xs: 140, sm: 240, md: 300 } }}
      renderInput={(params) => (
        <TextField
          {...params}
          placeholder="Search pages…"
          slotProps={{
            ...params.slotProps,
            htmlInput: { ...params.slotProps.htmlInput, "aria-label": "Search pages" },
            input: { ...params.slotProps.input, startAdornment: <InputAdornment position="start"><SearchIcon sx={{ fontSize: 19 }} /></InputAdornment> },
          }}
          sx={{ "& .MuiOutlinedInput-root": { height: 38, borderRadius: "10px", fontSize: "0.84rem", bgcolor: "rgb(255 255 255 / 0.9)", "& fieldset": { borderWidth: 1.5, borderColor: "#94a3b8" } } }}
        />
      )}
    />
  );
}
