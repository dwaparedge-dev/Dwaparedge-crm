"use client";
import { useContext, useEffect, useMemo, useState } from "react";
import type { GridColDef, GridRowParams, GridValidRowModel } from "@mui/x-data-grid";
import Box from "@mui/material/Box";
import CustomDataGrid from "@/components/shared/CustomDataGrid";
import ColumnCustomizer from "@/components/shared/CustomDataGrid/ColumnCustomizer";
import { ColumnsContext } from "./ListLayout";
import { EmptyState } from "./states";

interface Props<R extends GridValidRowModel> {
  rows: R[];
  columns: GridColDef<R>[];
  total: number;
  loading?: boolean;
  page: number; // zero-based
  pageSize: number;
  onPageChange: (page: number, pageSize: number) => void;
  onRowClick?: (row: R) => void;
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: React.ReactNode;
  /** Names the table; also keys the saved column choice. */
  label: string;
}

interface Saved {
  visible: string[];
  order: string[];
}

function loadSaved(key: string): Saved | null {
  try {
    const raw = typeof window === "undefined" ? null : window.localStorage.getItem(key);
    const v = raw ? (JSON.parse(raw) as Partial<Saved>) : null;
    return v && Array.isArray(v.visible) && Array.isArray(v.order) ? { visible: v.visible, order: v.order } : null;
  } catch {
    return null;
  }
}

/** FactoONE's CustomDataGrid + ColumnCustomizer (drag to reorder, tick to hide, remembered per table). */
export function DataTable<R extends GridValidRowModel>({ rows, columns, total, loading, page, pageSize, onPageChange, onRowClick, emptyTitle, emptyHint, emptyAction, label }: Props<R>) {
  const storageKey = `crm_columns_${label.toLowerCase().replace(/\W+/g, "_")}`;
  const [saved, setSaved] = useState<Saved | null>(() => loadSaved(storageKey));
  const [customizing, setCustomizing] = useState(false);
  const columnsCtx = useContext(ColumnsContext);
  useEffect(() => {
    columnsCtx?.register(() => setCustomizing(true));
    return () => columnsCtx?.register(null);
  }, [columnsCtx]);

  const allColumns = useMemo(() => columns.map((c) => ({ field: c.field, headerName: String(c.headerName ?? c.field) })), [columns]);
  const fields = useMemo(() => columns.map((c) => c.field), [columns]);
  // Columns added since the choice was saved stay visible and go at the end.
  const order = useMemo(() => (saved ? [...saved.order.filter((f) => fields.includes(f)), ...fields.filter((f) => !saved.order.includes(f))] : fields), [saved, fields]);
  const visible = useMemo(() => (saved ? fields.filter((f) => saved.visible.includes(f) || !saved.order.includes(f)) : fields), [saved, fields]);
  const shown = useMemo(() => order.filter((f) => visible.includes(f)).map((f) => columns.find((c) => c.field === f)!), [order, visible, columns]);

  if (!loading && rows.length === 0) return <Box sx={{ minHeight: 400, display: "grid", placeItems: "center" }}><EmptyState title={emptyTitle} hint={emptyHint} action={emptyAction} /></Box>;
  return (
    <>
      <CustomDataGrid<R>
        rows={rows}
        columns={shown}
        rowCount={total}
        loading={loading}
        paginationMode="server"
        paginationModel={{ page, pageSize }}
        onPaginationModelChange={(m) => onPageChange(m.page, m.pageSize)}
        rowHeight={64}
        sx={{
          border: "none",
          "& .MuiDataGrid-columnSeparator": { color: "#e2e8f0" },
          "& .MuiDataGrid-columnHeaders, & .MuiDataGrid-footerContainer": { borderColor: "#e2e8f0" },
          "& .MuiDataGrid-cell": { display: "flex", alignItems: "center", lineHeight: 1.45, borderColor: "#eef1f5" },
        }}
        onRowClick={onRowClick ? (p: GridRowParams<R>) => onRowClick(p.row) : undefined}
        onColumnCustomize={() => setCustomizing(true)}
      />
      <ColumnCustomizer
        open={customizing}
        onClose={() => setCustomizing(false)}
        allColumns={allColumns}
        visibleColumns={visible}
        columnOrder={order}
        defaultVisibleColumns={fields}
        defaultColumnOrder={fields}
        onSave={(v, o) => { setSaved({ visible: v, order: o }); setCustomizing(false); }}
        storageKey={storageKey}
      />
    </>
  );
}
