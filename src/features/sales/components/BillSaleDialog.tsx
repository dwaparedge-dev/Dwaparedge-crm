"use client";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useNotify } from "@/components/common/Notify";
import type { MilestoneRow, SaleItemRow } from "../service";
import { BillSaleForm } from "./BillSaleForm";

export function BillSaleDialog(props: { onCreated?: () => void; saleId: string; subtotal: string; items: SaleItemRow[]; milestones: MilestoneRow[]; initialMilestoneId?: string; onClose: () => void }) {
  const notify = useNotify();
  const { onClose, onCreated, ...rest } = props;
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create invoice for this sale</DialogTitle>
      <DialogContent>
        <BillSaleForm {...rest} onCancel={onClose} onCreated={() => { notify.success("Draft invoice created. Open it from the Invoices tab to review and issue it."); onCreated?.(); onClose(); }} />
      </DialogContent>
    </Dialog>
  );
}
