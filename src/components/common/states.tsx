import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Skeleton from "@mui/material/Skeleton";
import Typography from "@mui/material/Typography";

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: React.ReactNode }) {
  return (
    <Box sx={{ py: 6, textAlign: "center" }}>
      <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>{title}</Typography>
      {hint && (
        <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
          {hint}
        </Typography>
      )}
      {action && <Box sx={{ mt: 2 }}>{action}</Box>}
    </Box>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert severity="error" action={onRetry ? <Button color="inherit" size="small" onClick={onRetry}>Retry</Button> : undefined}>
      {message}
    </Alert>
  );
}

export function TableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <Box aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, r) => (
        <Box key={r} sx={{ display: "flex", gap: 2, py: 1.5, px: 2 }}>
          {Array.from({ length: cols }, (_, c) => (
            <Skeleton key={c} variant="text" sx={{ flex: 1 }} />
          ))}
        </Box>
      ))}
    </Box>
  );
}
