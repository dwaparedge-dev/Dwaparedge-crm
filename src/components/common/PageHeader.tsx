"use client";
import Box from "@mui/material/Box";
import WavyGradientHeader from "@/components/shared/WavyGradientHeader";
import type { Crumb } from "./crumb";

export type { Crumb };

/** The page banner (FactoONE's WavyGradientHeader) with the page's actions on the right. */
export function PageHeader({ title, subtitle, actions }: { title: React.ReactNode; subtitle?: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode }) {
  return (
    <Box sx={{ mt: { xs: 1, md: 2 } }}>
    <WavyGradientHeader compact title={title} subtitle={typeof subtitle === "string" ? subtitle : undefined}>
      {actions && (
        <Box
          sx={{
            display: "flex", gap: 1.5, flexWrap: "wrap", alignItems: "center",
            "& .MuiButton-root": { borderRadius: 10, px: 2.5 },
            "& .MuiButton-contained": { bgcolor: "#fff", color: "primary.dark", "&:hover": { bgcolor: "rgb(255 255 255 / 0.88)" } },
            "& .MuiButton-outlined, & .MuiButton-text": { color: "#fff", bgcolor: "rgb(255 255 255 / 0.14)", borderColor: "rgb(255 255 255 / 0.4)", "&:hover": { bgcolor: "rgb(255 255 255 / 0.24)", borderColor: "rgb(255 255 255 / 0.6)" } },
          }}
        >
          {actions}
        </Box>
      )}
    </WavyGradientHeader>
    </Box>
  );
}
