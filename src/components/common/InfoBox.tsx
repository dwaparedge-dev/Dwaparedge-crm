import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";

/** A labelled value in FactoONE's detail-view box style. */
export function InfoBox({ label, children }: { label: string; children?: React.ReactNode }) {
  return (
    <Box sx={{ p: 2, height: "100%", borderRadius: "10px", bgcolor: "#f8fafc", border: "1px solid", borderColor: "divider" }}>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", fontWeight: 600 }}>{label}</Typography>
      <Typography variant="body1" component="div" sx={{ fontWeight: 700, whiteSpace: "pre-line", wordBreak: "break-word" }}>{children || "—"}</Typography>
    </Box>
  );
}

/** Small uppercase heading used between groups of boxes. */
export function SectionLabel({ children }: { children: React.ReactNode }) {
  return <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.5px", mt: 2.5, mb: 1.25, "&:first-of-type": { mt: 0 } }}>{children}</Typography>;
}
