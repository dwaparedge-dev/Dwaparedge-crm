"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Chip from "@mui/material/Chip";
import Grid from "@mui/material/Grid";
import ArchiveIcon from "@mui/icons-material/ArchiveOutlined";
import BusinessIcon from "@mui/icons-material/BusinessOutlined";
import ContactsIcon from "@mui/icons-material/ContactsOutlined";
import EditIcon from "@mui/icons-material/EditOutlined";
import HandshakeIcon from "@mui/icons-material/HandshakeOutlined";
import HistoryIcon from "@mui/icons-material/HistoryOutlined";
import InfoIcon from "@mui/icons-material/InfoOutlined";
import ReceiptIcon from "@mui/icons-material/ReceiptLongOutlined";
import PaymentsIcon from "@mui/icons-material/PaymentsOutlined";
import RestoreIcon from "@mui/icons-material/RestoreFromTrashOutlined";
import VerifiedIcon from "@mui/icons-material/VerifiedOutlined";
import { format } from "date-fns";
import Link from "@mui/material/Link";
import Typography from "@mui/material/Typography";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { InfoBox, SectionLabel } from "@/components/common/InfoBox";
import { useNotify } from "@/components/common/Notify";
import { HeroActions } from "@/components/common/HeroActions";
import { useFetch } from "@/components/common/useFetch";
import { DetailTabPanel, DetailViewHeroSidebar, DetailViewLayout, DetailViewMetricStrip, DetailViewTabs, MasterStatusBadge } from "@/components/shared/DetailView";
import { api } from "@/lib/api-client";
import { OptionLabel } from "@/features/options/components/OptionSelect";
import { formatMoney } from "@/lib/format";
import { stateNameByCode } from "@/lib/india";
import { InvoicesList } from "@/features/invoices/components/InvoicesList";
import { LicensesList } from "@/features/licenses/components/LicensesList";
import { PaymentsList } from "@/features/payments/components/PaymentsList";
import { SalesList } from "@/features/sales/components/SalesList";
import type { ClientDocumentRow } from "../documents";
import type { ClientRow } from "../service";
import { ActivityTab } from "./ActivityTab";
import { ClientFormDialog } from "./ClientFormDialog";
import { ContactsTab } from "./ContactsTab";

interface SalesSummary {
  summary: { orderValue: string; billed: string; paid: string; balance: string };
  total: number;
}

export function ClientDetail({ id }: { id: string }) {
  const router = useRouter();
  const notify = useNotify();
  const { data: c, error, loading, reload } = useFetch<ClientRow>(`/api/clients/${id}`);
  const docs = useFetch<{ items: ClientDocumentRow[] }>(`/api/clients/${id}/documents`);
  const sales = useFetch<SalesSummary>(`/api/sales?clientId=${id}&pageSize=1`);
  const [tab, setTab] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);

  const archived = c?.archived_at != null;
  const tabs = useMemo(() => [
    { key: "overview", label: "Overview", icon: <InfoIcon sx={{ fontSize: 18 }} /> },
    { key: "contacts", label: "Contacts", icon: <ContactsIcon sx={{ fontSize: 18 }} /> },
    { key: "sales", label: "Sales", icon: <HandshakeIcon sx={{ fontSize: 18 }} /> },
    { key: "invoices", label: "Invoices", icon: <ReceiptIcon sx={{ fontSize: 18 }} /> },
    { key: "payments", label: "Payments", icon: <PaymentsIcon sx={{ fontSize: 18 }} /> },
    { key: "licenses", label: "Software Licenses", icon: <VerifiedIcon sx={{ fontSize: 18 }} /> },
    { key: "activity", label: "Activity History", icon: <HistoryIcon sx={{ fontSize: 18 }} /> },
  ], []);

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

  const s = sales.data?.summary;
  const state = c && stateNameByCode(c.state_code) ? `${stateNameByCode(c.state_code)} (${c.state_code})` : null;

  return (
    <>
      <DetailViewLayout
        isLoading={loading && !c}
        isError={Boolean(error) || (!loading && !c)}
        errorMessage={error ?? "Client not found"}
        onBack={() => router.push("/clients")}
        backLabel="Back to Clients"
        headerTitle={c?.display_name}
        headerSubtitle={c?.legal_name !== c?.display_name ? c?.legal_name : undefined}
        sidebar={c && (
          <DetailViewHeroSidebar
            onBack={() => router.push("/clients")}
            backLabel="Back to Clients"
            title={c.display_name}
            subtitle={c.gstin ?? undefined}
            subtitleLabel="GSTIN"
            avatarIcon={<BusinessIcon sx={{ fontSize: 32 }} />}
            badges={<MasterStatusBadge status={archived ? "inactive" : "active"} customLabel={archived ? "Archived" : "Active"} />}
            attributes={[
              { label: "Client code", value: c.code ?? "—", isMonospace: true },
              { label: "Legal name", value: c.legal_name },
              { label: "PAN", value: c.pan ?? "—", isMonospace: true },
              { label: "Email", value: c.email ?? "—" },
              { label: "Phone", value: c.phone ?? "—" },
              { label: "State", value: state ?? "—" },
              { label: "Account owner", value: c.owner_name ?? "Unassigned" },
            ]}
            actions={
              <HeroActions>
                {!archived && <Button fullWidth variant="contained" startIcon={<EditIcon />} onClick={() => setEditing(true)}>Edit client</Button>}
                <Button fullWidth variant="outlined" color={archived ? "primary" : "error"} startIcon={archived ? <RestoreIcon /> : <ArchiveIcon />} onClick={() => setConfirm(true)}>
                  {archived ? "Restore" : "Archive"}
                </Button>
              </HeroActions>
            }
          />
        )}
        metricStrip={
          <DetailViewMetricStrip
            columns={4}
            metrics={[
              { label: "Order value", value: formatMoney(s?.orderValue), subtitle: `${sales.data?.total ?? 0} sale${sales.data?.total === 1 ? "" : "s"}` },
              { label: "Billed", value: formatMoney(s?.billed), subtitle: "on issued invoices" },
              { label: "Paid", value: formatMoney(s?.paid), subtitle: "incl. advances", color: "#10b981" },
              { label: "Balance remaining", value: formatMoney(s?.balance), subtitle: "still to be received", color: Number(s?.balance ?? 0) > 0 ? "#f59e0b" : undefined },
            ]}
          />
        }
      >
        <DetailViewTabs tabs={tabs} activeTab={tab} onChange={setTab}>
          <DetailTabPanel value={tab} index={0}>
            {c && (
              <>
                <SectionLabel>Business details</SectionLabel>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Client code">{c.code}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Legal name">{c.legal_name}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><InfoBox label="Account owner">{c.owner_name}</InfoBox></Grid>
                  <Grid size={12}>
                    <InfoBox label="Brand names">
                      {c.brand_names && (
                        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.5 }}>
                          {c.brand_names.split(",").map((b) => <Chip key={b} label={b.trim()} size="small" />)}
                        </Box>
                      )}
                    </InfoBox>
                  </Grid>
                  <Grid size={{ xs: 12, md: 4 }}><InfoBox label="GSTIN">{c.gstin}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><InfoBox label="PAN">{c.pan}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 4 }}><InfoBox label="State">{state}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Email">{c.email}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Phone">{c.phone}</InfoBox></Grid>
                </Grid>
                <SectionLabel>Address</SectionLabel>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Billing address">{c.billing_address}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Shipping address">{c.shipping_address}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="City">{c.city}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 3 }}><InfoBox label="Postal code">{c.postal_code}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 3 }}><InfoBox label="Country">{c.country}</InfoBox></Grid>
                </Grid>
                <SectionLabel>Bank details</SectionLabel>
                <Grid container spacing={2}>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Bank name">{c.bank_name}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Branch">{c.bank_branch}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Account number">{c.bank_account_no}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="IFSC">{c.bank_ifsc}</InfoBox></Grid>
                </Grid>
                <SectionLabel>Documents</SectionLabel>
                <Grid container spacing={2}>
                  {(docs.data?.items ?? []).map((d) => (
                    <Grid size={{ xs: 12, md: 4 }} key={d.id}>
                      <InfoBox label={d.doc_name}>
                        <Link href={`/api/clients/${id}/documents/${d.id}`} target="_blank" rel="noopener" underline="hover">{d.file_name}</Link>
                        <Typography variant="caption" color="text.secondary" component="div" sx={{ fontWeight: 500 }}>
                          <OptionLabel table="client_documents" column="doc_type" value={d.doc_type} />
                        </Typography>
                      </InfoBox>
                    </Grid>
                  ))}
                  {docs.data?.items.length === 0 && <Grid size={12}><InfoBox label="Documents">{null}</InfoBox></Grid>}
                </Grid>
                <SectionLabel>Notes and history</SectionLabel>
                <Grid container spacing={2}>
                  <Grid size={12}><InfoBox label="Internal notes">{c.notes}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Created">{format(new Date(c.created_at), "dd MMM yyyy")}</InfoBox></Grid>
                  <Grid size={{ xs: 12, md: 6 }}><InfoBox label="Last modified">{format(new Date(c.updated_at), "dd MMM yyyy")}</InfoBox></Grid>
                </Grid>
              </>
            )}
          </DetailTabPanel>
          <DetailTabPanel value={tab} index={1}><ContactsTab clientId={id} readOnly={archived} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={2}><SalesList clientId={id} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={3}><InvoicesList clientId={id} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={4}><PaymentsList clientId={id} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={5}><LicensesList clientId={id} /></DetailTabPanel>
          <DetailTabPanel value={tab} index={6}><ActivityTab clientId={id} /></DetailTabPanel>
        </DetailViewTabs>
      </DetailViewLayout>
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
      {editing && <ClientFormDialog clientId={id} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); reload(); docs.reload(); }} />}
    </>
  );
}
