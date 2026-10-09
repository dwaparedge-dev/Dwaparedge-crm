import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { LOGIC_FILES, SEED_FILES, TABLE_REGISTRY } from "../db/schema";
import { parseColumns } from "../db/sync";

describe("schema registry", () => {
  it("lists every table file, once, with no duplicates", () => {
    const names = TABLE_REGISTRY.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    const onDisk = readdirSync("db/tables").flatMap((m) => readdirSync(join("db/tables", m)).map((f) => `${m}/${f}`)).filter((f) => f.endsWith(".sql")).sort();
    expect(TABLE_REGISTRY.map((t) => t.file).sort()).toEqual(onDisk);
  });

  it("puts each table after the tables it references", () => {
    const seen = new Set<string>();
    for (const t of TABLE_REGISTRY) {
      const sql = readFileSync(join("db/tables", t.file), "utf8");
      for (const m of sql.matchAll(/REFERENCES\s+([a-z_]+)\s*\(/gi)) {
        if (m[1] !== t.name) expect(seen.has(m[1]), `${t.name} references ${m[1]}`).toBe(true);
      }
      seen.add(t.name);
    }
  });

  it("has every logic and seed file", () => {
    for (const f of LOGIC_FILES) expect(() => readFileSync(join("db/logic", f))).not.toThrow();
    for (const f of SEED_FILES) expect(() => readFileSync(join("db/seeds", f))).not.toThrow();
  });
});

describe("parseColumns", () => {
  it("reads columns, skips constraints, strips comments", () => {
    const sql = `CREATE TABLE IF NOT EXISTS t (
  id    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  amount NUMERIC(14,2) NOT NULL DEFAULT 0, -- a comment, with a comma
  ref   UUID REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT t_chk CHECK (amount >= 0),
  UNIQUE (id, ref)
);
CREATE INDEX IF NOT EXISTS t_idx ON t (ref);`;
    expect(parseColumns(sql)).toEqual([
      { name: "id", def: "UUID PRIMARY KEY DEFAULT gen_random_uuid()" },
      { name: "amount", def: "NUMERIC(14,2) NOT NULL DEFAULT 0" },
      { name: "ref", def: "UUID REFERENCES users(id) ON DELETE SET NULL" },
    ]);
  });

  it("finds columns in every registered table", () => {
    for (const t of TABLE_REGISTRY) expect(parseColumns(readFileSync(join("db/tables", t.file), "utf8")).length, t.name).toBeGreaterThan(2);
  });
});
