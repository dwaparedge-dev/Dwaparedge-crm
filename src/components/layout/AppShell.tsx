"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import Popover from "@mui/material/Popover";
import MenuItem from "@mui/material/MenuItem";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import DashboardIcon from "@mui/icons-material/SpaceDashboardOutlined";
import ClientsIcon from "@mui/icons-material/BusinessOutlined";
import ProductsIcon from "@mui/icons-material/Inventory2Outlined";
import SalesIcon from "@mui/icons-material/HandshakeOutlined";
import LicensesIcon from "@mui/icons-material/VpnKeyOutlined";
import InvoicesIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import NotificationsIcon from "@mui/icons-material/NotificationsNoneOutlined";
import LockIcon from "@mui/icons-material/LockOutlined";
import LogoutIcon from "@mui/icons-material/Logout";
import { NAV_GROUPS, type NavItem } from "./nav";
import { useNotify } from "@/components/common/Notify";
import { ChangePasswordDialog } from "./ChangePasswordDialog";
import { PageSearch } from "./PageSearch";

const FULL = 230;
const MINI = 71;

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  dashboard: <DashboardIcon />,
  clients: <ClientsIcon />,
  products: <ProductsIcon />,
  sales: <SalesIcon />,
  licenses: <LicensesIcon />,
  invoices: <InvoicesIcon />,
  payments: <PaymentsIcon />,
  settings: <SettingsIcon />,
};

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const [bellAnchor, setBellAnchor] = useState<HTMLElement | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);
  const pathname = usePathname();
  const router = useRouter();
  const notify = useNotify();

  const mini = isDesktop && collapsed;
  const width = isDesktop ? (collapsed ? MINI : FULL) : 0;

  async function logout() {
    setMenuAnchor(null);
    try {
      const res = await fetch("/api/auth/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      if (!res.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      notify.error("Could not sign out. Please try again.");
    }
  }

  const nav = (
    <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 1.5, px: mini ? 1.5 : 2.5, py: 2.5, minHeight: 72 }}>
        <Avatar variant="rounded" sx={{ bgcolor: "primary.main", width: 38, height: 38, fontWeight: 700 }}>DE</Avatar>
        {!mini && <Typography variant="subtitle1" sx={{ fontWeight: 700, flexGrow: 1 }} noWrap>DwaparEdge</Typography>}
        {isDesktop && !mini && (
          <Tooltip title="Collapse sidebar"><IconButton size="small" aria-label="Collapse sidebar" onClick={() => setCollapsed(true)}><ChevronLeftIcon /></IconButton></Tooltip>
        )}
      </Box>
      {mini && <Box sx={{ display: "flex", justifyContent: "center", pb: 1 }}><Tooltip title="Expand sidebar" placement="right"><IconButton size="small" aria-label="Expand sidebar" onClick={() => setCollapsed(false)}><ChevronRightIcon /></IconButton></Tooltip></Box>}
      <Box component="nav" aria-label="Main navigation" sx={{ px: 1.5, py: 1.5, flexGrow: 1, overflowY: "auto" }}>
        {NAV_GROUPS.map((group, gi) => (
          <Box key={group.title} sx={{ mb: 1 }}>
            {mini ? (gi > 0 && <Divider sx={{ my: 1 }} />) : (
              <Box sx={{ display: "flex", alignItems: "center", gap: 1, px: 1.5, pt: gi ? 1.5 : 0.5, pb: 0.75 }}>
                <Box sx={{ width: 7, height: 7, borderRadius: "50%", bgcolor: group.dot }} />
                <Typography variant="caption" sx={{ fontWeight: 600, letterSpacing: "0.08em", textTransform: "uppercase", color: "text.secondary" }}>{group.title}</Typography>
              </Box>
            )}
            <List disablePadding>
              {group.items.map((item) => {
                const selected = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                const button = (
                  <ListItemButton
                    key={item.href}
                    component={item.ready ? Link : "div"}
                    {...(item.ready ? { href: item.href } : { "aria-disabled": true })}
                    disabled={!item.ready}
                    selected={selected}
                    onClick={() => setMobileOpen(false)}
                    sx={{ borderRadius: 2, mb: 0.5, py: 1.1, justifyContent: mini ? "center" : "flex-start" }}
                  >
                    <ListItemIcon sx={{ minWidth: mini ? 0 : 40 }}>{ICONS[item.icon]}</ListItemIcon>
                    {!mini && <ListItemText primary={item.label} slotProps={{ primary: { variant: "body1", sx: { fontWeight: 500 } } }} />}
                  </ListItemButton>
                );
                return mini ? (
                  <Tooltip key={item.href} title={item.label} placement="right"><span>{button}</span></Tooltip>
                ) : button;
              })}
            </List>
          </Box>
        ))}
      </Box>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh", bgcolor: "background.default" }}>

      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{ width, flexShrink: 0, "& .MuiDrawer-paper": { width, boxSizing: "border-box", overflowX: "hidden", bgcolor: "background.default", borderRight: 0 } }}
        >
          {nav}
        </Drawer>
      ) : (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ "& .MuiDrawer-paper": { width: FULL, bgcolor: "background.default", borderRight: 0 } }}
        >
          {nav}
        </Drawer>
      )}

      <Box sx={{ flexGrow: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
      <Box component="header" sx={{ position: "sticky", top: 0, zIndex: 1100, bgcolor: "background.default", px: { xs: 1.5, md: 3 }, pt: 2, pb: 2.5 }}>
        <Box
          sx={{
            display: "flex", alignItems: "center", justifyContent: "space-between", gap: { xs: 1, md: 2 }, px: { xs: 1, md: 2 }, py: 1, borderRadius: "14px",
            bgcolor: "rgb(255 255 255 / 0.85)", backdropFilter: "blur(10px)", border: "1px solid rgb(226 232 240 / 0.9)", boxShadow: "0 4px 12px rgb(15 23 42 / 0.08)",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1, minWidth: 0 }}>
            {!isDesktop && <IconButton aria-label="Open navigation" onClick={() => setMobileOpen(true)}><MenuIcon /></IconButton>}
            <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: "-0.01em" }} noWrap>DwaparEdge CRM</Typography>
          </Box>
          <Box sx={{ display: "flex", alignItems: "center", gap: { xs: 0.5, md: 1.5 } }}>
            <Box sx={{ display: { xs: "none", sm: "block" } }}><PageSearch onNavigate={(href) => router.push(href)} /></Box>
            <Tooltip title="Notifications">
              <IconButton aria-label="Notifications" onClick={(e) => setBellAnchor(e.currentTarget)}><NotificationsIcon /></IconButton>
            </Tooltip>
            <Tooltip title="Settings">
              <IconButton aria-label="Settings" onClick={() => router.push("/settings")}><SettingsIcon /></IconButton>
            </Tooltip>
            <Tooltip title={user.email}>
              <IconButton aria-label="Account menu" onClick={(e) => setMenuAnchor(e.currentTarget)} sx={{ p: 0.5 }}>
                <Avatar sx={{ width: 38, height: 38, bgcolor: "primary.main", fontSize: 15 }}>{user.name.slice(0, 1).toUpperCase()}</Avatar>
              </IconButton>
            </Tooltip>
          </Box>
          <Popover
            anchorEl={bellAnchor} open={Boolean(bellAnchor)} onClose={() => setBellAnchor(null)}
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }} transformOrigin={{ vertical: "top", horizontal: "right" }}
            slotProps={{ paper: { sx: { mt: 1.5, width: 300, borderRadius: 2, p: 2 } } }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>Notifications</Typography>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>You’re all caught up.</Typography>
          </Popover>
          <Menu
            anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}
            transformOrigin={{ horizontal: "right", vertical: "top" }} anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
            slotProps={{ paper: { elevation: 0, sx: { overflow: "visible", filter: "drop-shadow(0px 2px 8px rgba(0,0,0,0.1))", mt: 1.5, minWidth: 240, borderRadius: 2,
              "&::before": { content: '""', display: "block", position: "absolute", top: 0, right: 14, width: 10, height: 10, bgcolor: "background.paper", transform: "translateY(-50%) rotate(45deg)" } } } }}
          >
            <Box sx={{ px: 2, py: 1.5, display: "flex", alignItems: "center", gap: 1.5 }}>
              <Avatar sx={{ width: 40, height: 40, bgcolor: "action.hover", color: "text.primary" }}>{user.name.slice(0, 1).toUpperCase()}</Avatar>
              <Box sx={{ minWidth: 0 }}>
                <Typography variant="subtitle2" noWrap sx={{ fontWeight: 600 }}>{user.name}</Typography>
                <Typography variant="body2" color="text.secondary" noWrap>{user.email}</Typography>
              </Box>
            </Box>
            <Divider />
            <MenuItem sx={{ py: 1.5 }} onClick={() => { setMenuAnchor(null); router.push("/settings"); }}>
              <ListItemIcon><SettingsIcon fontSize="small" /></ListItemIcon><ListItemText primary="Settings" />
            </MenuItem>
            <MenuItem sx={{ py: 1.5 }} onClick={() => { setMenuAnchor(null); setChangingPassword(true); }}>
              <ListItemIcon><LockIcon fontSize="small" /></ListItemIcon><ListItemText primary="Change password" />
            </MenuItem>
            <Box sx={{ p: 2 }}>
              <Button variant="contained" color="error" fullWidth startIcon={<LogoutIcon />} onClick={logout} sx={{ borderRadius: 2 }}>Logout</Button>
            </Box>
          </Menu>
        </Box>
      </Box>
        <Box
          component="main"
          sx={{
            flexGrow: 1, width: "100%", bgcolor: "#fff", px: { xs: 2, md: 3 }, pt: { xs: 2.5, md: 4 }, pb: { xs: 4, md: 6 },
            borderTopLeftRadius: { md: 16 }, borderBottomLeftRadius: { md: 16 },
            borderTopRightRadius: { xs: 16, md: 0 }, borderBottomRightRadius: { xs: 16, md: 0 },
          }}
        >
          <Box sx={{ maxWidth: 1440, mx: "auto", width: "100%" }}>{children}</Box>
        </Box>
      </Box>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </Box>
  );
}
