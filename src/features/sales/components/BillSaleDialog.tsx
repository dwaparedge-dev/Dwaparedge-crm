"use client";
import { useRouter } from "next/navigation";
import Dialog from "@mui/material/Dialog";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import { useNotify } from "@/components/common/Notify";
import type { MilestoneRow, SaleItemRow } from "../service";
import { BillSaleForm } from "./BillSaleForm";

export function BillSaleDialog(props: { saleId: string; subtotal: string; items: SaleItemRow[]; milestones: MilestoneRow[]; initialMilestoneId?: string; onClose: () => void }) {
  const router = useRouter();
  const notify = useNotify();
  const { onClose, ...rest } = props;
  return (
    <Dialog open onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Create invoice for this sale</DialogTitle>
      <DialogContent>
        <BillSaleForm {...rest} onCancel={onClose} onCreated={(id) => { notify.success("Draft invoice created. Review it, then issue it."); router.push(`/invoices/${id}`); }} />
      </DialogContent>
    </Dialog>
  );
}
