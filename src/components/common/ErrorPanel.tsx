"use client";
import { useEffect } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Typography from "@mui/material/Typography";

/** Shared fallback for route error boundaries. The server log holds the details; the digest links them. */
export function ErrorPanel({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <Box role="alert" sx={{ py: 8, textAlign: "center" }}>
      <Typography variant="h5" gutterBottom>Something went wrong</Typography>
      <Typography color="text.secondary" sx={{ mb: 3 }}>
        The page could not be loaded. Your data is safe. Try again, and if it keeps happening, contact support{error.digest ? ` and quote reference ${error.digest}` : ""}.
      </Typography>
      <Button variant="contained" onClick={() => retry()}>Try again</Button>
    </Box>
  );
}
