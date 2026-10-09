"use client";
import { createTheme } from "@mui/material/styles";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { main: "#1e4fd8" },
    secondary: { main: "#0f766e" },
    background: { default: "#f5f7fb", paper: "#ffffff" },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: "var(--font-inter), system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
    h5: { fontWeight: 600 },
    h6: { fontWeight: 600 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiCard: { defaultProps: { variant: "outlined" } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiButton: { defaultProps: { disableElevation: true } },
  },
});
