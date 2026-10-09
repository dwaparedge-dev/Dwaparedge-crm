"use client";
import { createContext, useMemo, useState } from "react";
import Box from "@mui/material/Box";
import Card from "@mui/material/Card";
import FilterToolbar from "@/components/shared/FilterToolbar";
import StandardSearchInput from "@/components/shared/StandardSearchInput";
import TableToolbar from "@/components/shared/TableToolbar";

/** Lets the table (a child) hand its "customise columns" menu to the toolbar button above it. */
export const ColumnsContext = createContext<{ register: (open: ((anchor: HTMLElement) => void) | null) => void } | null>(null);

interface Props {
  search: { value: string; onChange: (v: string) => void; placeholder: string; label: string };
  /** Extra filter controls on the left of the filter bar. */
  filters?: React.ReactNode;
  /** Status tabs on the left of the table card. */
  tabs?: React.ReactNode;
  /** Buttons at the right end of the table card's top row. */
  actions?: React.ReactNode;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Optional line between the tab row and the table. */
  notice?: React.ReactNode;
  /** Embedded inside another page (e.g. a client's sales tab): one card, no filter bar. */
  compact?: boolean;
  children: React.ReactNode;
}

const cardSx = { borderRadius: "14px", overflow: "hidden", border: "1px solid #e2e8f0", boxShadow: "0 6px 24px rgba(15, 23, 42, 0.05)" } as const;

/** Standard list page body: FilterToolbar (filters + search) above a table card (TableToolbar + grid). */
export function ListLayout({ search, filters, tabs, actions, onRefresh, refreshing, notice, compact, children }: Props) {
  const [openColumns, setOpenColumns] = useState<((anchor: HTMLElement) => void) | null>(null);
  const ctx = useMemo(() => ({ register: (fn: ((anchor: HTMLElement) => void) | null) => setOpenColumns(() => fn) }), []);
  const searchBox = <StandardSearchInput value={search.value} onChange={search.onChange} placeholder={search.placeholder} minWidth={{ xs: "100%", sm: 240, md: compact ? 220 : 320 }} />;
  return (
    <>
      {!compact && <FilterToolbar leftFilters={filters} search={searchBox} sx={{ mb: 2.5 }} />}
      <Card sx={cardSx}>
        <TableToolbar
          leftContent={tabs} rightContent={<>{compact && filters}{compact && <Box sx={{ flex: { xs: "1 1 100%", sm: "0 1 auto" }, minWidth: 0 }}>{searchBox}</Box>}{actions}</>} onRefresh={onRefresh} isRefreshing={refreshing}
          onCustomizeColumns={() => { const el = document.activeElement; if (el instanceof HTMLElement) openColumns?.(el); }}
        />
        {notice}
        <ColumnsContext.Provider value={ctx}>{children}</ColumnsContext.Provider>
      </Card>
    </>
  );
}
