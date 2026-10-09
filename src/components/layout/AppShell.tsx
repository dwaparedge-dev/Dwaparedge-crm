"use client";
import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import AppBar from "@mui/material/AppBar";
import Avatar from "@mui/material/Avatar";
import Box from "@mui/material/Box";
import Divider from "@mui/material/Divider";
import Drawer from "@mui/material/Drawer";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import Toolbar from "@mui/material/Toolbar";
import Tooltip from "@mui/material/Tooltip";
import Typography from "@mui/material/Typography";
import useMediaQuery from "@mui/material/useMediaQuery";
import { useTheme } from "@mui/material/styles";
import MenuIcon from "@mui/icons-material/Menu";
import ChevronLeftIcon from "@mui/icons-material/ChevronLeft";
import DashboardIcon from "@mui/icons-material/SpaceDashboardOutlined";
import ClientsIcon from "@mui/icons-material/BusinessOutlined";
import ProductsIcon from "@mui/icons-material/Inventory2Outlined";
import SalesIcon from "@mui/icons-material/HandshakeOutlined";
import LicensesIcon from "@mui/icons-material/VpnKeyOutlined";
import InvoicesIcon from "@mui/icons-material/ReceiptLongOutlined";
import ReportsIcon from "@mui/icons-material/AssessmentOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import SettingsIcon from "@mui/icons-material/SettingsOutlined";
import { NAV_ITEMS, type NavItem } from "./nav";
import { useNotify } from "@/components/common/Notify";
import { ChangePasswordDialog } from "./ChangePasswordDialog";

const FULL = 248;
const MINI = 68;

const ICONS: Record<NavItem["icon"], React.ReactNode> = {
  dashboard: <DashboardIcon />,
  clients: <ClientsIcon />,
  products: <ProductsIcon />,
  sales: <SalesIcon />,
  licenses: <LicensesIcon />,
  invoices: <InvoicesIcon />,
  payments: <PaymentsIcon />,
  reports: <ReportsIcon />,
  settings: <SettingsIcon />,
};

export function AppShell({ user, children }: { user: { name: string; email: string }; children: React.ReactNode }) {
  const theme = useTheme();
  const isDesktop = useMediaQuery(theme.breakpoints.up("md"));
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
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
      <Toolbar sx={{ px: mini ? 1.5 : 2.5, gap: 1.5 }}>
        <Avatar variant="rounded" sx={{ bgcolor: "primary.main", width: 36, height: 36, fontWeight: 700 }}>
          DE
        </Avatar>
        {!mini && (
          <Typography variant="subtitle1" sx={{ fontWeight: 700 }} noWrap>
            DwaparEdge
          </Typography>
        )}
      </Toolbar>
      <Divider />
      <List component="nav" aria-label="Main navigation" sx={{ px: 1, py: 1.5, flexGrow: 1 }}>
        {NAV_ITEMS.map((item) => {
          const selected = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          const button = (
            <ListItemButton
              key={item.href}
              component={item.ready ? Link : "div"}
              {...(item.ready ? { href: item.href } : { "aria-disabled": true })}
              disabled={!item.ready}
              selected={selected}
              onClick={() => setMobileOpen(false)}
              sx={{ borderRadius: 2, mb: 0.5, justifyContent: mini ? "center" : "flex-start" }}
            >
              <ListItemIcon sx={{ minWidth: mini ? 0 : 40 }}>{ICONS[item.icon]}</ListItemIcon>
              {!mini && <ListItemText primary={item.label} slotProps={{ primary: { variant: "body2", sx: { fontWeight: 500 } } }} />}
            </ListItemButton>
          );
          return mini ? (
            <Tooltip key={item.href} title={item.ready ? item.label : `${item.label} (coming soon)`} placement="right">
              <span>{button}</span>
            </Tooltip>
          ) : (
            button
          );
        })}
      </List>
    </Box>
  );

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar
        position="fixed"
        color="inherit"
        elevation={0}
        sx={{
          borderBottom: 1,
          borderColor: "divider",
          width: { md: `calc(100% - ${width}px)` },
          ml: { md: `${width}px` },
        }}
      >
        <Toolbar>
          <IconButton
            edge="start"
            aria-label={isDesktop ? "Collapse sidebar" : "Open navigation"}
            onClick={() => (isDesktop ? setCollapsed((c) => !c) : setMobileOpen(true))}
            sx={{ mr: 1 }}
          >
            {isDesktop && !collapsed ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Typography variant="h6" sx={{ flexGrow: 1 }} noWrap>
            Business Hub
          </Typography>
          <Tooltip title={user.email}>
            <IconButton aria-label="Account menu" onClick={(e) => setMenuAnchor(e.currentTarget)}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: "secondary.main", fontSize: 14 }}>
                {user.name.slice(0, 1).toUpperCase()}
              </Avatar>
            </IconButton>
          </Tooltip>
          <Menu anchorEl={menuAnchor} open={Boolean(menuAnchor)} onClose={() => setMenuAnchor(null)}>
            <MenuItem disabled>{user.name}</MenuItem>
            <MenuItem onClick={() => { setMenuAnchor(null); setChangingPassword(true); }}>Change password</MenuItem>
            <MenuItem onClick={logout}>Sign out</MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {isDesktop ? (
        <Drawer
          variant="permanent"
          sx={{ width, flexShrink: 0, "& .MuiDrawer-paper": { width, boxSizing: "border-box", overflowX: "hidden" } }}
        >
          {nav}
        </Drawer>
      ) : (
        <Drawer
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          ModalProps={{ keepMounted: true }}
          sx={{ "& .MuiDrawer-paper": { width: FULL } }}
        >
          {nav}
        </Drawer>
      )}

      <Box component="main" sx={{ flexGrow: 1, minWidth: 0, p: { xs: 2, md: 3 } }}>
        <Toolbar />
        {children}
      </Box>
      {changingPassword && <ChangePasswordDialog onClose={() => setChangingPassword(false)} />}
    </Box>
  );
}
