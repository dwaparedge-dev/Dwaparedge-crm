"use client";
import { alpha, createTheme } from "@mui/material/styles";

// Colours and type scale follow FactoONE (industrial slate primary, Materio-style neutrals).
const PRIMARY = { main: "#384152", light: "#5B687C", dark: "#242B37" };
// Comma-separated rgba on purpose: the data grid parses these colours and chokes on the space-separated form.
const ink = (a: number) => `rgba(46, 38, 61, ${a})`;
const SHADOW_MD = "0 2px 6px 0 rgb(46 38 61 / 0.12)";

export const theme = createTheme({
  cssVariables: true,
  palette: {
    mode: "light",
    primary: { ...PRIMARY, contrastText: "#fff" },
    secondary: { main: "#6D788D", light: "#8A93A4", dark: "#626C7F", contrastText: "#fff" },
    error: { main: "#FF4D49", light: "#FF716D", dark: "#E64542", contrastText: "#fff" },
    warning: { main: "#FDB528", light: "#FDC453", dark: "#E4A324", contrastText: "#fff" },
    info: { main: "#26C6F9", light: "#51D1FA", dark: "#22B3E1", contrastText: "#fff" },
    success: { main: "#2E7D32", light: "#4CAF50", dark: "#1B5E20", contrastText: "#fff" },
    text: { primary: ink(0.9), secondary: ink(0.7), disabled: ink(0.4) },
    divider: ink(0.12),
    background: { default: "#F7F7F9", paper: "#FFFFFF" },
  },
  shape: { borderRadius: 6 },
  spacing: (factor: number) => `${0.25 * factor}rem`,
  typography: {
    fontFamily: 'var(--font-inter), "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    h1: { fontSize: "2.375rem", fontWeight: 500, lineHeight: 1.37 },
    h2: { fontSize: "2rem", fontWeight: 500, lineHeight: 1.5 },
    h3: { fontSize: "1.75rem", fontWeight: 500, lineHeight: 1.43 },
    h4: { fontSize: "1.5rem", fontWeight: 500, lineHeight: 1.33 },
    h5: { fontSize: "1.125rem", fontWeight: 500, lineHeight: 1.33 },
    h6: { fontSize: "0.9375rem", fontWeight: 500, lineHeight: 1.47 },
    subtitle1: { fontSize: "0.9375rem", lineHeight: 1.47 },
    subtitle2: { fontSize: "0.8125rem", fontWeight: 400, lineHeight: 1.54 },
    body1: { fontSize: "0.9375rem", lineHeight: 1.47 },
    body2: { fontSize: "0.8125rem", lineHeight: 1.54 },
    button: { fontSize: "0.9375rem", lineHeight: 1.47, textTransform: "none", fontWeight: 500 },
    caption: { fontSize: "0.8125rem", lineHeight: 1.38 },
  },
  components: {
    MuiButton: {
      defaultProps: { disableElevation: true },
      styleOverrides: { root: { borderRadius: 6 } },
    },
    MuiCard: {
      defaultProps: { elevation: 0 },
      styleOverrides: { root: { boxShadow: SHADOW_MD, border: 0 } },
    },
    MuiCardContent: { styleOverrides: { root: { padding: "1.25rem", "&:last-child": { paddingBottom: "1.25rem" } } } },
    MuiPaper: { defaultProps: { elevation: 0 } },
    MuiAppBar: { styleOverrides: { root: { backgroundImage: "none" } } },
    MuiDrawer: { styleOverrides: { paper: { borderRight: "1px solid var(--mui-palette-divider)", boxShadow: "none" } } },
    MuiDialog: {
      styleOverrides: {
        paper: ({ theme }) => ({
          borderRadius: 8, boxShadow: "0 8px 24px 0 rgb(46 38 61 / 0.24)",
          // Phones: nearly edge to edge, scrolling inside the dialog.
          [theme.breakpoints.down("sm")]: { margin: 8, width: "calc(100% - 16px)", maxWidth: "calc(100% - 16px)", maxHeight: "calc(100% - 16px)" },
        }),
      },
    },
    MuiDialogTitle: { styleOverrides: { root: { fontSize: "1.125rem", fontWeight: 500, padding: "1.25rem 1.5rem", "@media (max-width:599.95px)": { padding: "1rem 1rem" } } } },
    MuiDialogContent: { styleOverrides: { root: { padding: "0 1.5rem 1rem", "@media (max-width:599.95px)": { padding: "0 1rem 1rem" } } } },
    MuiDialogActions: { styleOverrides: { root: { padding: "1rem 1.5rem 1.25rem", "@media (max-width:599.95px)": { padding: "0.75rem 1rem 1rem", flexWrap: "wrap" } } } },
    MuiTextField: { defaultProps: { variant: "outlined" } },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          "&:not(.Mui-focused):not(.Mui-error):hover .MuiOutlinedInput-notchedOutline": { borderColor: ink(0.35) },
        },
        notchedOutline: { borderColor: ink(0.22) },
      },
    },
    MuiChip: { styleOverrides: { root: { fontWeight: 500 } } },
    MuiTabs: { styleOverrides: { indicator: { height: 3, borderRadius: 3 } } },
    MuiTab: { styleOverrides: { root: { textTransform: "none", fontWeight: 500, minHeight: 44 } } },
    // Wide data tables keep their layout on phones and scroll sideways inside their card.
    MuiTableContainer: { styleOverrides: { root: ({ theme }) => ({ overflowX: "auto", WebkitOverflowScrolling: "touch", [theme.breakpoints.down("md")]: { "& > .MuiTable-root": { minWidth: 640 } } }) } },
    MuiTableCell: {
      styleOverrides: {
        root: { borderColor: "var(--mui-palette-divider)" },
        head: { fontWeight: 600, fontSize: "0.75rem", letterSpacing: "0.04em", textTransform: "uppercase", color: ink(0.8), backgroundColor: alpha(PRIMARY.main, 0.04) },
      },
    },
    MuiListItemButton: {
      styleOverrides: {
        root: {
          borderRadius: 6,
          "&.Mui-selected": { backgroundColor: PRIMARY.main, color: "#fff", boxShadow: `0 2px 8px ${alpha(PRIMARY.main, 0.4)}` },
          "&.Mui-selected:hover": { backgroundColor: PRIMARY.dark },
          "&.Mui-selected .MuiListItemIcon-root": { color: "#fff" },
        },
      },
    },
    MuiLink: { defaultProps: { underline: "hover" } },
    MuiTooltip: { styleOverrides: { tooltip: { fontSize: "0.75rem" } } },
  },
});
