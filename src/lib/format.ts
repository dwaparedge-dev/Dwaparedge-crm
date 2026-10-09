const inr = new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2 });

/** Display only. Never feed the result (or a Number) back into financial calculations. */
export function formatMoney(amount: string | null | undefined, currency = "INR"): string {
  if (amount === null || amount === undefined || amount === "") return "—";
  if (currency === "INR") return inr.format(Number(amount));
  return `${currency} ${Number(amount).toLocaleString("en-IN", { minimumFractionDigits: 2 })}`;
}
