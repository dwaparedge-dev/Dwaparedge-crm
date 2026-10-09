"use client";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

export default function NotFound() {
  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", textAlign: "center", p: 2 }}>
      <Box>
        <Typography variant="h4" gutterBottom>Page not found</Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>The page you are looking for does not exist or has moved.</Typography>
        <Button component={Link} href="/" variant="contained">Back to dashboard</Button>
      </Box>
    </Box>
  );
}
