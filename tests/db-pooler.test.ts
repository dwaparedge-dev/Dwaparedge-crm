import { describe, expect, it } from "vitest";
import { sessionPoolerWarning } from "@/lib/db/pooler";

describe("sessionPoolerWarning", () => {
  it("warns about the Supabase session pooler", () => {
    expect(sessionPoolerWarning("postgresql://u:p@aws-1-ap-south-1.pooler.supabase.com:5432/postgres")).toMatch(/port 6543/);
    expect(sessionPoolerWarning("postgresql://u:p@aws-1-ap-south-1.pooler.supabase.com/postgres")).not.toBeNull();
  });
  it("accepts the transaction pooler, a local database and anything unparsable", () => {
    expect(sessionPoolerWarning("postgresql://u:p@aws-1-ap-south-1.pooler.supabase.com:6543/postgres")).toBeNull();
    expect(sessionPoolerWarning("postgresql://u:p@localhost:5432/postgres")).toBeNull();
    expect(sessionPoolerWarning("not a url")).toBeNull();
  });
});
