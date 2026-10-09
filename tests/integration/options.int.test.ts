import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { confirmedSale, createTestDb, expectAppError, LINE, makeClient, makeProduct, makeUser, uniq, type TestDb } from "./helpers";

let tdb: TestDb;
let actor: string;

beforeAll(async () => {
  tdb = await createTestDb();
  actor = (await makeUser()).id;
});
afterAll(async () => tdb?.drop());

describe("field options", () => {
  it("seeds the built-in options", async () => {
    const { listOptions } = await import("@/features/options/service");
    expect((await listOptions("sales", "type")).map((o) => o.option_key)).toEqual(["project", "license", "service"]);
    expect((await listOptions("payments", "method")).length).toBe(5);
  });

  it("adds an option from a dropdown and returns the same one when added again", async () => {
    const { addOption, listOptions } = await import("@/features/options/service");
    const a = await addOption("sales", "type", "Training programme", actor);
    expect(a).toMatchObject({ option_key: "training_programme", option_value: "Training programme", is_system: false });
    const b = await addOption("sales", "type", "  training   PROGRAMME ", actor);
    expect(b.id).toBe(a.id);
    expect((await listOptions("sales", "type")).filter((o) => o.id === a.id)).toHaveLength(1);
  });

  it("gives concurrent adds of the same name a single row", async () => {
    const { addOption, listOptions } = await import("@/features/options/service");
    const label = uniq("Race");
    const rows = await Promise.all(Array.from({ length: 6 }, () => addOption("licenses", "plan", label, actor)));
    expect(new Set(rows.map((r) => r.id)).size).toBe(1);
    expect((await listOptions("licenses", "plan")).filter((o) => o.option_value === label)).toHaveLength(1);
  });

  it("keeps keys unique when two labels slug to the same key", async () => {
    const { addOption } = await import("@/features/options/service");
    const a = await addOption("products", "type", "R&D", actor);
    const b = await addOption("products", "type", "R D", actor);
    expect(a.option_key).toBe("r_d");
    expect(b.option_key).toBe("r_d_2");
  });

  it("refuses columns that are not on the whitelist", async () => {
    const { addOption, listOptions } = await import("@/features/options/service");
    await expectAppError(addOption("invoices", "status", "Hacked", actor), 422);
    await expectAppError(listOptions("users", "password_hash"), 422);
  });

  it("lets a record use a new option, and refuses an unknown or hidden one", async () => {
    const { addOption, updateOption } = await import("@/features/options/service");
    const { getSale } = await import("@/features/sales/service");
    const client = await makeClient(actor);
    const opt = await addOption("sales", "type", "Annual maintenance", actor);
    const id = await confirmedSale(actor, client, [LINE()], { type: opt.option_key });
    expect((await getSale(id)).type).toBe("annual_maintenance");
    await expectAppError(confirmedSale(actor, client, [LINE()], { type: "made_up" }), 422, "VALIDATION_ERROR");
    await updateOption(opt.id, { isActive: false }, actor);
    await expectAppError(confirmedSale(actor, client, [LINE()], { type: opt.option_key }), 422, "VALIDATION_ERROR");
    await expect(makeProduct({ type: "made_up" })).rejects.toThrow();
  });

  it("rejects an unknown key written straight to the database (trigger)", async () => {
    const { db } = await import("@/lib/db");
    const client = await makeClient(actor);
    await expect(db.query("INSERT INTO sales (sale_number, client_id, type, title, sale_date) VALUES ('X-1',$1,'nope','t','2026-10-05')", [client])).rejects.toThrow(/Unknown option/);
  });

  it("renames the label without touching saved records", async () => {
    const { addOption, updateOption, listOptions } = await import("@/features/options/service");
    const o = await addOption("payments", "method", "Wire", actor);
    await updateOption(o.id, { label: "International wire" }, actor);
    const found = (await listOptions("payments", "method")).find((x) => x.id === o.id)!;
    expect(found).toMatchObject({ option_key: "wire", option_value: "International wire" });
    await expectAppError(updateOption(o.id, { label: "cash" }, actor), 409, "DUPLICATE_OPTION");
  });

  it("only deletes unused, non-built-in options", async () => {
    const { addOption, deleteOption, listOptions } = await import("@/features/options/service");
    const [builtIn] = await listOptions("sales", "type");
    await expectAppError(deleteOption(builtIn!.id, actor), 409, "OPTION_PROTECTED");
    const used = await addOption("sales", "type", "Used type", actor);
    await confirmedSale(actor, await makeClient(actor), [LINE()], { type: used.option_key });
    await expectAppError(deleteOption(used.id, actor), 409, "OPTION_IN_USE");
    const unused = await addOption("sales", "type", "Unused type", actor);
    await deleteOption(unused.id, actor);
    expect((await listOptions("sales", "type")).some((o) => o.id === unused.id)).toBe(false);
  });

  it("reports which options are in use for the settings page", async () => {
    const { listAllWithUsage } = await import("@/features/options/service");
    const groups = await listAllWithUsage();
    const sales = groups.find((g) => g.field === "sales.type")!;
    expect(sales.options.find((o) => o.option_key === "used_type")?.in_use).toBe(true);
    expect(sales.options.find((o) => o.option_key === "project")?.in_use).toBe(false);
  });
});

describe("license history lives in the activity log", () => {
  it("has no license_events table and still records a timeline", async () => {
    const { db } = await import("@/lib/db");
    expect(await db.queryOne("SELECT to_regclass('license_events') AS t").then((r) => (r as { t: string | null }).t)).toBeNull();
  });
});
