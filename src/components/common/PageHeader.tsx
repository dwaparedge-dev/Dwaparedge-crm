import Link from "next/link";
import Box from "@mui/material/Box";
import Breadcrumbs from "@mui/material/Breadcrumbs";
import Typography from "@mui/material/Typography";
import MuiLink from "@mui/material/Link";

export interface Crumb {
  label: string;
  href?: string;
}

export function PageHeader({ title, crumbs, actions }: { title: React.ReactNode; crumbs?: Crumb[]; actions?: React.ReactNode }) {
  return (
    <Box sx={{ mb: 3 }}>
      {crumbs && (
        <Breadcrumbs aria-label="Breadcrumb" sx={{ mb: 0.5 }}>
          {crumbs.map((c) =>
            c.href ? (
              <MuiLink key={c.label} component={Link} href={c.href} underline="hover" color="inherit" variant="body2">
                {c.label}
              </MuiLink>
            ) : (
              <Typography key={c.label} variant="body2" color="text.primary">
                {c.label}
              </Typography>
            ),
          )}
        </Breadcrumbs>
      )}
      <Box sx={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, flexWrap: "wrap" }}>
        <Typography variant="h5" component="h1">
          {title}
        </Typography>
        {actions && <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>{actions}</Box>}
      </Box>
    </Box>
  );
}
