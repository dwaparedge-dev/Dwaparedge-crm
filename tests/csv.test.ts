import { describe, expect, it } from "vitest";
import { toCsv } from "@/lib/csv";

describe("toCsv", () => {
  it("quotes commas, quotes and newlines", () => {
    const out = toCsv(["a", "b"], [["x,y", 'say "hi"'], ["line1\nline2", "ok"]], [true, true]);
    expect(out).toContain('"x,y","say ""hi"""');
    expect(out).toContain('"line1\nline2",ok');
  });
  it("neutralises spreadsheet formulas in text cells only", () => {
    const out = toCsv(["name", "amount"], [["=HYPERLINK(\"http://evil\")", "-0.33"], ["+1+1", "5"], ["@SUM(A1)", "0"]], [true, false]);
    expect(out).toContain("'=HYPERLINK");
    expect(out).toContain("'+1+1");
    expect(out).toContain("'@SUM(A1)");
    expect(out).toContain(",-0.33"); // money stays numeric
  });
  it("handles null and undefined as empty", () => {
    expect(toCsv(["a", "b"], [[null, undefined]], [true, true])).toContain("\r\n,\r\n");
  });
});
