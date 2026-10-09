import "server-only";
import { db } from "@/lib/db";
import { logActivity } from "@/lib/activity";
import type { SettingsInput } from "./schema";

export interface CompanySettings {
  legal_name: string; trade_name: string | null; address: string; city: string | null; state_code: string | null; postal_code: string | null;
  gstin: string | null; pan: string | null; email: string | null; phone: string | null; website: string | null;
  bank_account_name: string | null; bank_name: string | null; bank_account_number: string | null; bank_ifsc: string | null; bank_branch: string | null; upi_id: string | null;
  invoice_prefix: string; receipt_prefix: string; default_due_days: number; default_payment_terms: string | null; default_invoice_notes: string | null;
  signatory_name: string | null; round_off_total: boolean; updated_at: string;
}

export const getSettings = async (runner?: Parameters<typeof db.queryOne>[2]) =>
  (await db.queryOne<CompanySettings>("SELECT * FROM company_settings WHERE id = 1", [], runner))!;

export async function updateSettings(i: SettingsInput, actorId: string) {
  await db.transaction(async (tx) => {
    await tx.query(
      `UPDATE company_settings SET legal_name=$1, trade_name=$2, address=$3, city=$4, state_code=$5, postal_code=$6, gstin=$7, pan=$8, email=$9, phone=$10,
         website=$11, bank_account_name=$12, bank_name=$13, bank_account_number=$14, bank_ifsc=$15, bank_branch=$16, upi_id=$17, invoice_prefix=$18,
         receipt_prefix=$19, default_due_days=$20, default_payment_terms=$21, default_invoice_notes=$22, signatory_name=$23, round_off_total=$24, updated_at=now()
       WHERE id = 1`,
      [i.legalName, i.tradeName, i.address, i.city, i.stateCode, i.postalCode, i.gstin, i.pan, i.email, i.phone, i.website, i.bankAccountName, i.bankName,
        i.bankAccountNumber, i.bankIfsc, i.bankBranch, i.upiId, i.invoicePrefix, i.receiptPrefix, i.defaultDueDays, i.defaultPaymentTerms, i.defaultInvoiceNotes,
        i.signatoryName, i.roundOffTotal],
    );
    await logActivity({ entityType: "settings", entityId: "00000000-0000-0000-0000-000000000001", action: "updated", summary: "Company settings updated", actorId }, tx);
  });
}
