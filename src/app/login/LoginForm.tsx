"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  async function onSubmit(values: FormValues) {
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error?.message ?? "Sign-in failed. Please try again.");
        return;
      }
      const next = params.get("next");
      router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
      router.refresh();
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  return (
    <Box sx={{ minHeight: "100vh", display: "grid", placeItems: "center", p: 2 }}>
      <Card sx={{ width: "100%", maxWidth: 400 }}>
        <CardContent sx={{ p: 4 }}>
          <Typography variant="h5" gutterBottom>
            DwaparEdge Business Hub
          </Typography>
          <Typography color="text.secondary" sx={{ mb: 3 }}>
            Sign in with your staff account.
          </Typography>
          {error && (
            <Alert severity="error" sx={{ mb: 2 }}>
              {error}
            </Alert>
          )}
          <Box component="form" noValidate onSubmit={handleSubmit(onSubmit)} sx={{ display: "grid", gap: 2 }}>
            <TextField
              label="Email"
              type="email"
              autoComplete="username"
              autoFocus
              error={Boolean(errors.email)}
              helperText={errors.email?.message}
              {...register("email")}
            />
            <TextField
              label="Password"
              type="password"
              autoComplete="current-password"
              error={Boolean(errors.password)}
              helperText={errors.password?.message}
              {...register("password")}
            />
            <Button type="submit" variant="contained" size="large" disabled={isSubmitting}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
