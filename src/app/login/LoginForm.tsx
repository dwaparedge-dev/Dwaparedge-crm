"use client";
import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import CircularProgress from "@mui/material/CircularProgress";
import IconButton from "@mui/material/IconButton";
import InputAdornment from "@mui/material/InputAdornment";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import EmailIcon from "@mui/icons-material/EmailOutlined";
import LockIcon from "@mui/icons-material/LockOutlined";
import VisibilityIcon from "@mui/icons-material/VisibilityOutlined";
import VisibilityOffIcon from "@mui/icons-material/VisibilityOffOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import VerifiedIcon from "@mui/icons-material/VerifiedOutlined";

const schema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});
type FormValues = z.infer<typeof schema>;

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const idle = params.get("reason") === "idle";
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
      goNext();
    } catch {
      setError("Network error. Please check your connection and try again.");
    }
  }

  function goNext() {
    const next = params.get("next");
    router.replace(next && next.startsWith("/") && !next.startsWith("//") ? next : "/");
    router.refresh();
  }

  const features = [
    { icon: <ReceiptIcon />, title: "GST invoices", text: "Raise, issue and track invoices against every sale." },
    { icon: <PaymentsIcon />, title: "Payments & receivables", text: "See what is collected, due and overdue at a glance." },
    { icon: <VerifiedIcon />, title: "Software licences", text: "Never miss a renewal across your clients." },
  ];

  return (
    <Box sx={{ position: "relative", minHeight: "100dvh", display: "grid", gridTemplateColumns: { xs: "1fr", md: "minmax(360px, 5fr) 6fr" }, bgcolor: "background.default" }}>
      {/* Brand panel */}
      <Box
        sx={{
          position: "relative", overflow: "hidden", color: "#fff", display: { xs: "none", md: "flex" }, flexDirection: "column", justifyContent: "space-between",
          px: { xs: 5, md: 14 }, py: { xs: 6, md: 14 }, gap: { xs: 6, md: 0 },
          background: "linear-gradient(145deg, #4a5568 0%, #384152 45%, #1d2330 100%)",
          "&::before": { content: '""', position: "absolute", width: 520, height: 520, borderRadius: "50%", top: -180, right: -160, background: "radial-gradient(circle, rgb(255 255 255 / 0.16), transparent 68%)" },
          "&::after": { content: '""', position: "absolute", width: 420, height: 420, borderRadius: "50%", bottom: -160, left: -120, background: "radial-gradient(circle, rgb(38 198 249 / 0.18), transparent 70%)" },
        }}
      >
        <Box sx={{ position: "relative", zIndex: 1, display: "flex", alignItems: "center", gap: 3 }}>
          <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, bgcolor: "rgb(255 255 255 / 0.14)", border: "1px solid rgb(255 255 255 / 0.28)", backdropFilter: "blur(6px)" }}>DE</Box>
          <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}>DwaparEdge CRM</Typography>
        </Box>
        <Box sx={{ position: "relative", zIndex: 1, my: 0 }}>
          <Typography sx={{ fontSize: { xs: "1.35rem", md: "2.25rem" }, fontWeight: 700, lineHeight: 1.25, letterSpacing: "-0.02em", maxWidth: 440 }}>
            Clients, billing and licences, in one place.
          </Typography>
          <Box sx={{ display: { xs: "none", md: "grid" }, gap: 6, mt: 12, maxWidth: 440 }}>
            {features.map((f) => (
              <Box key={f.title} sx={{ display: "flex", gap: 4, alignItems: "flex-start" }}>
                <Box sx={{ width: 40, height: 40, flexShrink: 0, borderRadius: "10px", display: "grid", placeItems: "center", bgcolor: "rgb(255 255 255 / 0.12)", border: "1px solid rgb(255 255 255 / 0.2)" }}>{f.icon}</Box>
                <Box>
                  <Typography sx={{ fontWeight: 600 }}>{f.title}</Typography>
                  <Typography variant="body2" sx={{ color: "rgb(255 255 255 / 0.72)" }}>{f.text}</Typography>
                </Box>
              </Box>
            ))}
          </Box>
        </Box>
        <Typography variant="caption" sx={{ position: "relative", zIndex: 1, color: "rgb(255 255 255 / 0.6)", display: { xs: "none", md: "block" } }}>
          Internal tool for DwaparEdge staff
        </Typography>
      </Box>

      {/* Phones and tablets: no banner, just the logo pinned to the top left. */}
      <Box sx={{ display: { xs: "flex", md: "none" }, alignItems: "center", gap: 3, position: "absolute", top: 20, left: 20 }}>
        <Box sx={{ width: 44, height: 44, borderRadius: "12px", display: "grid", placeItems: "center", fontWeight: 800, fontSize: 18, color: "#fff", background: "linear-gradient(145deg, #4a5568, #242B37)" }}>DE</Box>
        <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: "-0.01em" }}>DwaparEdge CRM</Typography>
      </Box>

      {/* Form panel */}
      <Box sx={{ display: "grid", placeItems: "center", px: { xs: 5, md: 14 }, py: { xs: 8, md: 14 }, minWidth: 0 }}>
        <Box sx={{ width: "100%", maxWidth: 420 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, letterSpacing: "-0.02em", fontSize: { xs: "1.6rem", md: "2rem" } }}>Welcome back</Typography>
          <Typography color="text.secondary" sx={{ mt: 2, mb: 8 }}>Sign in with your staff account to continue.</Typography>
          {idle && !error && <Alert severity="info" sx={{ mb: 5 }}>You were signed out after 30 minutes of inactivity.</Alert>}
          {error && <Alert severity="error" sx={{ mb: 5 }}>{error}</Alert>}
          <Box component="form" noValidate onSubmit={handleSubmit(onSubmit)} sx={{ display: "grid", gap: 5, "& .MuiOutlinedInput-root": { bgcolor: "#fff" }, "& input:-webkit-autofill": { WebkitBoxShadow: "0 0 0 100px #fff inset", WebkitTextFillColor: "inherit", caretColor: "inherit", borderRadius: "inherit" } }}>
            <TextField
              label="Email" type="email" autoComplete="username" autoFocus fullWidth
              error={Boolean(errors.email)} helperText={errors.email?.message}
              slotProps={{ input: { startAdornment: <InputAdornment position="start"><EmailIcon fontSize="small" /></InputAdornment> } }}
              {...register("email")}
            />
            <TextField
              label="Password" type={showPassword ? "text" : "password"} autoComplete="current-password" fullWidth
              error={Boolean(errors.password)} helperText={errors.password?.message}
              slotProps={{
                input: {
                  startAdornment: <InputAdornment position="start"><LockIcon fontSize="small" /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton size="small" edge="end" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((v) => !v)} onMouseDown={(e) => e.preventDefault()}>
                        {showPassword ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                      </IconButton>
                    </InputAdornment>
                  ),
                },
              }}
              {...register("password")}
            />
            <Button type="submit" variant="contained" size="large" disabled={isSubmitting} sx={{ py: 3, borderRadius: "10px", fontSize: "1rem", boxShadow: "0 6px 16px rgb(56 65 82 / 0.28)" }}
              startIcon={isSubmitting ? <CircularProgress size={18} color="inherit" /> : undefined}>
              {isSubmitting ? "Signing in…" : "Sign in"}
            </Button>
          </Box>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: "center", mt: 8 }}>
            Trouble signing in? Ask an administrator to reset your password.
          </Typography>
        </Box>
      </Box>
    </Box>
  );
}
