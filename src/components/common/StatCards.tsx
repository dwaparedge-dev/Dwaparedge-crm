"use client";
import React from "react";
import { StatCard, StatCardGrid, ACCENT_AMBER, ACCENT_CYAN, ACCENT_EMERALD, ACCENT_INDIGO, ACCENT_VIOLET } from "@/components/shared/StatCard";

const ACCENTS = [ACCENT_INDIGO, ACCENT_CYAN, ACCENT_EMERALD, ACCENT_AMBER, ACCENT_VIOLET];

export interface Stat {
  label: string;
  value: string | number;
  /** Shown under the value. */
  hint?: string;
  icon?: React.ReactNode;
  /** Makes the card a filter button. */
  onClick?: () => void;
  selected?: boolean;
}

/** A row of FactoONE StatCards. Give a card `onClick`/`selected` to use it as a filter. */
export function StatCards({ stats, loading }: { stats: Stat[]; loading?: boolean }) {
  const anySelected = stats.some((s) => s.selected);
  return (
    <StatCardGrid columns={{ xs: 2, sm: 2, md: Math.min(stats.length, 4) }} gap={{ xs: 1.25, sm: 2, md: 2.5 }} sx={{ mb: 3 }}>
      {stats.map((s, i) => (
        <StatCard
          key={s.label} value={s.value} label={s.label} subtitle={s.hint} icon={s.icon ?? <span />} accentColor={ACCENTS[i % ACCENTS.length]}
          isLoading={loading} onClick={s.onClick} isSelected={s.selected} isDimmed={anySelected && !s.selected}
        />
      ))}
    </StatCardGrid>
  );
}
