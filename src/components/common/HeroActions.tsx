import Box from "@mui/material/Box";

/** Stacked action buttons for the dark detail-view sidebar: white primary, outlined secondary, soft-red danger. */
export function HeroActions({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: "flex", flexDirection: "column", gap: 1, width: "100%",
        "& .MuiButton-root": { borderRadius: 2, fontWeight: 600 },
        "& .MuiButton-contained": { bgcolor: "#fff", color: "#242B37", "&:hover": { bgcolor: "rgb(255 255 255 / 0.88)" } },
        "& .MuiButton-outlined": { color: "#fff", borderColor: "rgb(255 255 255 / 0.45)", bgcolor: "rgb(255 255 255 / 0.06)", "&:hover": { bgcolor: "rgb(255 255 255 / 0.16)", borderColor: "rgb(255 255 255 / 0.7)" } },
        "& .MuiButton-outlinedError": { color: "#fca5a5", borderColor: "rgb(252 165 165 / 0.55)", bgcolor: "rgb(239 68 68 / 0.1)", "&:hover": { bgcolor: "rgb(239 68 68 / 0.22)", borderColor: "#fca5a5" } },
        "& .MuiButton-outlinedWarning": { color: "#fde68a", borderColor: "rgb(253 230 138 / 0.55)", bgcolor: "rgb(245 158 11 / 0.1)" },
        "& .Mui-disabled": { opacity: 0.45, color: "#fff !important", bgcolor: "rgb(255 255 255 / 0.08) !important", borderColor: "rgb(255 255 255 / 0.2) !important" },
      }}
    >
      {children}
    </Box>
  );
}
