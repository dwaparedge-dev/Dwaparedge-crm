"use client";
import SharedSegmentedTabs from "@/components/shared/SegmentedTabs";

export interface SegmentedTab {
  value: string;
  label: string;
  count?: number;
}

/** Thin adapter over FactoONE's SegmentedTabs (value/onChange instead of activeTab). */
export function SegmentedTabs({ tabs, value, onChange }: { tabs: SegmentedTab[]; value: string; onChange: (v: string) => void; label?: string }) {
  return <SharedSegmentedTabs tabs={tabs} activeTab={value} onChange={(v: string) => onChange(String(v))} size="small" />;
}
