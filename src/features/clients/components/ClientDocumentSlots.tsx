"use client";
import { useRef } from "react";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Grid from "@mui/material/Grid";
import IconButton from "@mui/material/IconButton";
import Link from "@mui/material/Link";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutlined";
import UploadIcon from "@mui/icons-material/UploadFileOutlined";
import { useNotify } from "@/components/common/Notify";
import { OptionSelect } from "@/features/options/components/OptionSelect";
import { DOC_ACCEPT, DOC_MAX_BYTES, DOC_MIME_BY_EXT, fileExtension } from "../schema";
import type { ClientDocumentRow } from "../documents";

/** One document row in the form: a file with its name and type. `id` is set once the file is stored. */
export interface DocSlot {
  id?: string;
  docName: string;
  docType: string;
  /** Name of the stored file, or of the one just chosen. */
  fileName: string;
  file: File | null;
  remove: boolean;
  /** Name and type as stored, to tell whether an existing document changed. */
  saved?: { docName: string; docType: string };
}

export const emptySlot = (): DocSlot => ({ docName: "", docType: "", fileName: "", file: null, remove: false });
export const slotFromDocument = (d: Pick<ClientDocumentRow, "id" | "doc_name" | "doc_type" | "file_name">): DocSlot => ({
  id: d.id, docName: d.doc_name, docType: d.doc_type, fileName: d.file_name, file: null, remove: false,
  saved: { docName: d.doc_name, docType: d.doc_type },
});

export const slotsFromDocuments = (docs: ClientDocumentRow[]): DocSlot[] => docs.map(slotFromDocument);

/** Problems with a slot that would stop it being stored, keyed by field. Empty when it is fine or unused. */
export function slotErrors(s: DocSlot): Partial<Record<"docName" | "docType" | "file", string>> {
  if (s.remove) return {};
  const used = s.id || s.file || s.docName.trim() || s.docType;
  if (!used) return {};
  const e: Partial<Record<"docName" | "docType" | "file", string>> = {};
  if (!s.docName.trim()) e.docName = "Enter a document name";
  if (!s.docType) e.docType = "Select a document type";
  if (!s.id && !s.file) e.file = "Choose a file to upload";
  return e;
}

interface Props {
  slots: DocSlot[];
  onChange: (slots: DocSlot[]) => void;
  /** Show what is missing in each used row (set after a save attempt). */
  showErrors: boolean;
  clientId?: string;
}

export function ClientDocumentSlots({ slots, onChange, showErrors, clientId }: Props) {
  const notify = useNotify();
  const inputs = useRef<(HTMLInputElement | null)[]>([]);
  const patch = (i: number, p: Partial<DocSlot>) => onChange(slots.map((s, n) => (n === i ? { ...s, ...p } : s)));

  function choose(i: number, file: File | undefined) {
    if (!file) return;
    if (!(fileExtension(file.name) in DOC_MIME_BY_EXT) || file.size > DOC_MAX_BYTES || file.size === 0) {
      patch(i, { file: null });
      notify.error(file.size > DOC_MAX_BYTES ? "That file is larger than 4 MB." : "Upload a non-empty PDF, image (PNG, JPG, WEBP), Word or Excel file.");
      return;
    }
    // A file picked for a blank name suggests its own name (without the extension).
    patch(i, { file, fileName: file.name, docName: slots[i]!.docName.trim() ? slots[i]!.docName : file.name.replace(/\.[^.]+$/, "") });
  }

  return (
    <Box sx={{ display: "grid", gap: 2 }}>
      {slots.length === 0 && <Typography variant="body2" color="text.secondary">No documents yet. Add the GST certificate, agreements or anything else for this client.</Typography>}
      {slots.map((s, i) => {
        const err = showErrors ? slotErrors(s) : {};
        return (
          <Grid container spacing={2} key={i} sx={{ alignItems: "flex-start" }}>
            <Grid size={{ xs: 12, md: 4 }}>
              <TextField
                label="Document name" fullWidth value={s.docName} disabled={s.remove}
                onChange={(e) => patch(i, { docName: e.target.value })}
                error={Boolean(err.docName)} helperText={err.docName}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }}>
              <OptionSelect
                table="client_documents" column="doc_type" label="Type" value={s.docType} disabled={s.remove}
                onChange={(docType) => patch(i, { docType })} error={err.docType}
              />
            </Grid>
            <Grid size={{ xs: 12, md: 4 }} sx={{ display: "flex", alignItems: "center", gap: 1, minHeight: 56 }}>
              <input
                ref={(el) => { inputs.current[i] = el; }} type="file" hidden accept={DOC_ACCEPT}
                onChange={(e) => { choose(i, e.target.files?.[0]); e.target.value = ""; }}
              />
              {s.remove ? (
                <>
                  <Typography variant="body2" color="text.secondary" sx={{ flex: 1 }}>Will be removed on save</Typography>
                  <Button size="small" onClick={() => patch(i, { remove: false })}>Undo</Button>
                </>
              ) : (
                <>
                  <Button variant="outlined" size="small" startIcon={<UploadIcon />} onClick={() => inputs.current[i]?.click()} sx={{ flexShrink: 0 }}>
                    {s.fileName ? "Replace" : "Choose file"}
                  </Button>
                  <Box sx={{ minWidth: 0, flex: 1 }}>
                    {s.id && !s.file && clientId ? (
                      <Link href={`/api/clients/${clientId}/documents/${s.id}`} target="_blank" rel="noopener" variant="body2" noWrap sx={{ display: "block" }} title={s.fileName}>{s.fileName}</Link>
                    ) : (
                      <Typography variant="body2" color={err.file ? "error" : "text.secondary"} noWrap title={s.fileName}>
                        {s.fileName || err.file || "PDF, image, Word or Excel · max 4 MB"}
                      </Typography>
                    )}
                  </Box>
                  <IconButton
                      size="small" aria-label="Remove document"
                      onClick={() => (s.id ? patch(i, { remove: true }) : onChange(slots.filter((_, n) => n !== i)))}
                    >
                      <DeleteIcon fontSize="small" />
                    </IconButton>
                </>
              )}
            </Grid>
          </Grid>
        );
      })}
      <Box>
        <Button size="small" startIcon={<AddIcon />} onClick={() => onChange([...slots, emptySlot()])}>Add document</Button>
      </Box>
    </Box>
  );
}
