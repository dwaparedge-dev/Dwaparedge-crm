/** ₹1.2L / ₹3.4Cr style amounts for axes and tight spaces. */
export function compactInr(n: number): string {
  const a = Math.abs(n);
  const s = n < 0 ? "-" : "";
  if (a >= 1e7) return `${s}₹${+(a / 1e7).toFixed(2)}Cr`;
  if (a >= 1e5) return `${s}₹${+(a / 1e5).toFixed(2)}L`;
  if (a >= 1e3) return `${s}₹${+(a / 1e3).toFixed(1)}K`;
  return `${s}₹${Math.round(a)}`;
}
