"use client";
import Box from "@mui/material/Box";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import DownloadIcon from "@mui/icons-material/FileDownloadOutlined";
import ChartCard from "@/components/shared/ChartCard";
import { toCsv } from "../format";

export interface BarRow { label: string; value: number; hint?: string }

/** Saves CSV text (already spreadsheet-safe) as a file. The BOM makes Excel read it as UTF-8. */
export function downloadCsv(name: string, csv: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

/** A ranked list with a proportional bar behind each row, and a CSV button for the same rows. */
export function BarList({ id, title, subtitle, valueLabel = "Visits", rows, empty = "Nothing yet for this period" }: { id: string; title: string; subtitle?: string; valueLabel?: string; rows: BarRow[]; empty?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const total = rows.reduce((a, r) => a + r.value, 0);
  return (
    <ChartCard title={title} subtitle={subtitle} height="100%"
      action={rows.length ? <Tooltip title="Download CSV"><IconButton id={`${id}-csv`} size="small" aria-label={`Download ${title} as CSV`} onClick={() => downloadCsv(id, toCsv([[title, valueLabel], ...rows.map((r) => [r.label, r.value])]))}><DownloadIcon fontSize="small" /></IconButton></Tooltip> : undefined}>
      {rows.length === 0 ? <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: "center" }}>{empty}</Typography> : (
        <Box component="ul" sx={{ listStyle: "none", m: 0, p: 0, display: "grid", gap: 0.75 }}>
          {rows.map((r) => (
            <Box component="li" key={r.label} sx={{ position: "relative", borderRadius: 1, overflow: "hidden", px: 1.25, py: 0.75, display: "flex", justifyContent: "space-between", gap: 2 }}>
              <Box aria-hidden sx={{ position: "absolute", inset: 0, width: `${(r.value / max) * 100}%`, bgcolor: "primary.main", opacity: 0.1 }} />
              <Typography variant="body2" noWrap sx={{ position: "relative", minWidth: 0 }} title={r.label}>{r.label}</Typography>
              <Typography variant="body2" sx={{ position: "relative", fontWeight: 600, whiteSpace: "nowrap" }}>
                {r.value.toLocaleString("en-IN")}{r.hint ? <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}> · {r.hint}</Box> : total > 0 && rows.length > 1 ? <Box component="span" sx={{ color: "text.secondary", fontWeight: 400 }}> · {Math.round((r.value / total) * 100)}%</Box> : null}
              </Typography>
            </Box>
          ))}
        </Box>
      )}
    </ChartCard>
  );
}
