"use client";
import { useState } from "react";
import Link from "next/link";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Grid from "@mui/material/Grid";
import Skeleton from "@mui/material/Skeleton";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Typography from "@mui/material/Typography";
import { format } from "date-fns";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { PageHeader } from "@/components/common/PageHeader";
import { ErrorState } from "@/components/common/states";
import { useFetch } from "@/components/common/useFetch";
import { api } from "@/lib/api-client";
import type { ClientRow } from "../service";
import { InvoicesList } from "@/features/invoices/components/InvoicesList";
import { LicensesList } from "@/features/licenses/components/LicensesList";
import { PaymentsList } from "@/features/payments/components/PaymentsList";
import { SalesList } from "@/features/sales/components/SalesList";
import { ActivityTab } from "./ActivityTab";
import { ContactsTab } from "./ContactsTab";
import { StatusChip } from "./ClientsList";
import { stateNameByCode } from "@/lib/india";

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <Box>
      <Typography variant="caption" color="text.secondary">{label}</Typography>
      <Typography variant="body2" sx={{ whiteSpace: "pre-line" }}>{value || "—"}</Typography>
    </Box>
  );
}

export function ClientDetail({ id }: { id: string }) {
  const notify = useNotify();
  const { data: c, error, loading, reload } = useFetch<ClientRow>(`/api/clients/${id}`);
  const [tab, setTab] = useState(0);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  if (error) return <ErrorState message={error} onRetry={reload} />;
  if (loading || !c) return <><Skeleton width={260} height={40} /><Skeleton variant="rounded" height={240} sx={{ mt: 2 }} /></>;

  const archived = c.archived_at !== null;

  async function toggleArchive() {
    setBusy(true);
    try {
      await api(`/api/clients/${id}/archive`, { method: "POST", body: { archived: !archived } });
      notify.success(archived ? "Client restored" : "Client archived");
      setConfirm(false);
      reload();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Action failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader
        title={<>{c.display_name} <StatusChip archived={archived} /></>}
        crumbs={[{ label: "Dashboard", href: "/" }, { label: "Clients", href: "/clients" }, { label: c.display_name }]}
        actions={
          <>
            {!archived && <Button component={Link} href={`/clients/${id}/edit`} variant="outlined">Edit</Button>}
            <Button color={archived ? "primary" : "error"} variant="outlined" onClick={() => setConfirm(true)}>
              {archived ? "Restore" : "Archive"}
            </Button>
          </>
        }
      />
      <Card>
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto" sx={{ borderBottom: 1, borderColor: "divider" }}>
          <Tab label="Overview" />
          <Tab label="Contacts" />
          <Tab label="Sales" />
          <Tab label="Invoices" />
          <Tab label="Payments" />
          <Tab label="Software Licenses" />
          <Tab label="Activity History" />
        </Tabs>
        <CardContent>
          {tab === 0 && (
            <Grid container spacing={3}>
              <Grid size={{ xs: 12, md: 6 }}><Field label="Legal name" value={c.legal_name} /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><Field label="Account owner" value={c.owner_name} /></Grid>
              <Grid size={{ xs: 12, md: 4 }}><Field label="GSTIN" value={c.gstin} /></Grid>
              <Grid size={{ xs: 12, md: 4 }}><Field label="PAN" value={c.pan} /></Grid>
              <Grid size={{ xs: 12, md: 4 }}><Field label="State" value={stateNameByCode(c.state_code) ? `${stateNameByCode(c.state_code)} (${c.state_code})` : null} /></Grid>
              <Grid size={{ xs: 12, md: 4 }}><Field label="Email" value={c.email} /></Grid>
              <Grid size={{ xs: 12, md: 4 }}><Field label="Phone" value={c.phone} /></Grid>
              <Grid size={{ xs: 12, md: 4 }}><Field label="City / Postal code" value={[c.city, c.postal_code].filter(Boolean).join(" · ")} /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><Field label="Billing address" value={c.billing_address} /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><Field label="Shipping address" value={c.shipping_address} /></Grid>
              <Grid size={12}><Field label="Internal notes" value={c.notes} /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><Field label="Created" value={format(new Date(c.created_at), "dd MMM yyyy")} /></Grid>
              <Grid size={{ xs: 12, md: 6 }}><Field label="Last modified" value={format(new Date(c.updated_at), "dd MMM yyyy")} /></Grid>
            </Grid>
          )}
          {tab === 1 && <ContactsTab clientId={id} readOnly={archived} />}
          {tab === 2 && <SalesList clientId={id} />}
          {tab === 3 && <InvoicesList clientId={id} />}
          {tab === 4 && <PaymentsList clientId={id} />}
          {tab === 5 && <LicensesList clientId={id} />}
          {tab === 6 && <ActivityTab clientId={id} />}
        </CardContent>
      </Card>
      <ConfirmDialog
        open={confirm}
        title={archived ? "Restore client?" : "Archive client?"}
        message={archived
          ? "The client will return to the active list."
          : "The client will be hidden from the active list. Invoices, payments and licenses are kept, and you can restore it any time."}
        confirmLabel={archived ? "Restore" : "Archive"}
        destructive={!archived}
        busy={busy}
        onConfirm={toggleArchive}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}
