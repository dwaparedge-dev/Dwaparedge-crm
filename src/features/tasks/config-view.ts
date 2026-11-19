// What the Settings screens for task categories and priorities decide before they call the API: where a row lands when it is
// moved, and why a row cannot be deleted. Plain functions, so the exact outcomes are unit-tested (tests/tasks-config-view.test.ts).

interface Orderable {
  id: string;
  sort_order: number;
}

export interface NewOrder {
  id: string;
  sortOrder: number;
}

/**
 * The sort orders to save when the row at `index` moves one place up (`-1`) or down (`1`). `rows` is in the order shown, which
 * is the order of `sort_order` (ties broken by name). Only the rows whose number changes are returned, so a plain swap is two
 * saves. When two rows share a number (nothing says they cannot) a swap would not move anything, so the whole list is
 * numbered 10, 20, 30... instead. Moving past either end changes nothing.
 */
export function moveRow(rows: readonly Orderable[], index: number, dir: -1 | 1): NewOrder[] {
  const target = index + dir;
  if (index < 0 || index >= rows.length || target < 0 || target >= rows.length) return [];

  const moved = [...rows];
  [moved[index], moved[target]] = [moved[target]!, moved[index]!];

  const distinct = rows.every((r, i) => i === 0 || r.sort_order > rows[i - 1]!.sort_order);
  const slots = distinct ? rows.map((r) => r.sort_order) : rows.map((_, i) => (i + 1) * 10);

  const before = new Map(rows.map((r) => [r.id, r.sort_order]));
  const changes: NewOrder[] = [];
  moved.forEach((r, i) => {
    if (before.get(r.id) !== slots[i]) changes.push({ id: r.id, sortOrder: slots[i]! });
  });
  return changes;
}

/** Why a row cannot be deleted, in words for a tooltip; null when it can be. A row that is not deletable can still be hidden. */
export function deleteBlockedReason(row: { is_system: boolean; in_use: boolean }, noun: "category" | "priority"): string | null {
  const plural = noun === "category" ? "categories" : "priorities";
  if (row.is_system) return `Starter ${plural} can be hidden, not deleted`;
  if (row.in_use) return `Tasks use this ${noun}. Hide it instead.`;
  return null;
}
