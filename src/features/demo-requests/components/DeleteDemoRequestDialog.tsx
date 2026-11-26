"use client";
import { useState } from "react";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { useNotify } from "@/components/common/Notify";
import { api } from "@/lib/api-client";
import { announceDemoRequestsChanged } from "../useNewDemoRequestCount";

/** Asks first, then deletes a demo request for good. `onDeleted` runs after it is gone (go back to the list, or reload it). */
export function DeleteDemoRequestDialog({ request, onClose, onDeleted }: { request: { id: string; name: string; company: string }; onClose: () => void; onDeleted: () => void }) {
  const notify = useNotify();
  const [busy, setBusy] = useState(false);

  async function remove() {
    setBusy(true);
    try {
      await api(`/api/demo-requests/${request.id}`, { method: "DELETE" });
      notify.success("Demo request deleted");
      announceDemoRequestsChanged();
      onDeleted();
    } catch (e) {
      notify.error(e instanceof Error ? e.message : "Could not delete the demo request");
      setBusy(false);
    }
  }

  return (
    <ConfirmDialog
      open destructive busy={busy} title="Delete this demo request permanently?" confirmLabel="Delete permanently" onClose={onClose} onConfirm={() => void remove()}
      message={<>
        The request from <strong>{request.name}</strong> ({request.company}) will be removed for good, with its notes and contact details.
        <strong> This cannot be undone.</strong> An open follow-up task for it is cancelled. Only a one-line record that it was deleted stays in the activity log.
      </>}
    />
  );
}
