/**
 * Which `table.column` pairs are user-extendable dropdowns. Anything not listed here is refused by
 * the options API, so nobody can add options to a status column the code depends on.
 */
export const OPTION_FIELDS = {
  "sales.type": { title: "Sale types", noun: "sale type" },
  "products.type": { title: "Product types", noun: "product type" },
  "payments.method": { title: "Payment methods", noun: "payment method" },
  "licenses.plan": { title: "License plans", noun: "license plan" },
} as const;

export type OptionFieldKey = keyof typeof OPTION_FIELDS;
export const OPTION_FIELD_KEYS = Object.keys(OPTION_FIELDS) as OptionFieldKey[];

export function optionField(table: string, column: string): OptionFieldKey | null {
  const k = `${table}.${column}`;
  return k in OPTION_FIELDS ? (k as OptionFieldKey) : null;
}

export interface FieldOption {
  id: string;
  option_key: string;
  option_value: string;
  sort_order: number;
  is_active: boolean;
  is_system: boolean;
  in_use?: boolean;
}
