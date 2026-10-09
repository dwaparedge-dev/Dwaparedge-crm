import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import type { AutocompleteRenderInputParams } from "@mui/material/Autocomplete";

/** For an Autocomplete's TextField: a small spinner beside the arrow while the options are being fetched. */
export function autocompleteLoading(params: AutocompleteRenderInputParams, loading: boolean) {
  return {
    ...params.slotProps,
    input: { ...params.slotProps.input, endAdornment: <>{loading ? <CircularProgress color="inherit" size={18} /> : null}{params.slotProps.input.endAdornment}</> },
  };
}

/** For a `TextField select` whose menu items are fetched: a spinner next to the arrow until they arrive. */
export function selectLoading(loading: boolean) {
  return loading ? { input: { endAdornment: <InputAdornment position="end" sx={{ mr: 3 }}><CircularProgress size={16} /></InputAdornment> } } : undefined;
}
