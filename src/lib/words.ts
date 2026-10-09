const ONES = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen", "Seventeen", "Eighteen", "Nineteen"];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function below100(n: number): string {
  return n < 20 ? ONES[n]! : `${TENS[Math.floor(n / 10)]}${n % 10 ? " " + ONES[n % 10] : ""}`;
}
function below1000(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  return [h ? `${ONES[h]} Hundred` : "", r ? below100(r) : ""].filter(Boolean).join(" ");
}

/** Whole number in the Indian system (thousand, lakh, crore). */
export function integerInWords(n: number): string {
  if (n === 0) return "Zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${integerInWords(crore)} Crore`);
  if (lakh) parts.push(`${below100(lakh)} Lakh`);
  if (thousand) parts.push(`${below100(thousand)} Thousand`);
  if (rest) parts.push(below1000(rest));
  return parts.join(" ");
}

/** "12345.50" -> "Rupees Twelve Thousand Three Hundred Forty Five and Fifty Paise Only". */
export function amountInWordsINR(amount: string): string {
  const [rupeeStr, paiseStr = "0"] = amount.split(".");
  const rupees = Number(rupeeStr);
  const paise = Number(paiseStr.padEnd(2, "0").slice(0, 2));
  const r = `Rupees ${integerInWords(rupees)}`;
  return paise ? `${r} and ${below100(paise)} Paise Only` : `${r} Only`;
}
