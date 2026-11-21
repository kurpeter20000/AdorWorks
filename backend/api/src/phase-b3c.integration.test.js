// Migration 0114: payout methods and alert preferences.
import { describe, it, expect, beforeAll } from "vitest";
import { bootDb, asUser } from "./testDb.js";

let db;
const U = {
  talent: "00000000-0000-0000-0000-0000000000f1",
  other: "00000000-0000-0000-0000-0000000000f2",
  finance: "00000000-0000-0000-0000-0000000000f3",
  reviewer: "00000000-0000-0000-0000-0000000000f4",
};

beforeAll(async () => {
  db = await bootDb();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("insert into talent_profiles (id) values ($1) on conflict do nothing", [U.talent]);
  await db.query("update profiles set role = 'finance' where id = $1", [U.finance]);
  await db.query("update profiles set role = 'reviewer' where id = $1", [U.reviewer]);
  await db.query("insert into talent_payout_methods (talent_id, method, phone) values ($1, 'mgurush', '+211912345678')", [U.talent]);
}, 120_000);

describe("payout methods (0114 §1)", () => {
  it("the talent and finance staff can read them; nobody else", async () => {
    const own = await asUser(db, U.talent, {}, (tx) => tx.query("select method from talent_payout_methods"));
    expect(own.result.rows).toEqual([{ method: "mgurush" }]);
    const fin = await asUser(db, U.finance, { aal: "aal2" }, (tx) => tx.query("select count(*)::int as n from talent_payout_methods"));
    expect(fin.result.rows[0].n).toBe(1);
    for (const who of [U.other, U.reviewer]) {
      const r = await asUser(db, who, { aal: "aal2" }, (tx) => tx.query("select count(*)::int as n from talent_payout_methods"));
      expect(r.result.rows[0].n).toBe(0);
    }
  });

  it("needs complete details for the chosen method", async () => {
    const r = await asUser(db, U.talent, {}, (tx) => tx.query("update talent_payout_methods set method = 'bank' where talent_id = $1", [U.talent]));
    expect(r.error?.message).toMatch(/talent_payout_methods_complete/);
  });

  it("nobody can write someone else's", async () => {
    const r = await asUser(db, U.other, {}, (tx) => tx.query("insert into talent_payout_methods (talent_id, method, phone) values ($1, 'mtn_momo', '+211900000000')", [U.talent]));
    expect(r.error?.message).toMatch(/row-level security|duplicate/);
  });
});

describe("alert preferences (0114 §2)", () => {
  it("are private to their owner, and WhatsApp needs a number", async () => {
    const ok = await asUser(db, U.other, {}, (tx) =>
      tx.query("insert into alert_preferences (user_id, whatsapp_enabled, whatsapp_number, quiet_from, quiet_until) values ($1, true, '+211912345678', '21:00', '07:00')", [U.other])
    );
    expect(ok.error).toBeNull();
    const noNumber = await asUser(db, U.talent, {}, (tx) => tx.query("insert into alert_preferences (user_id, whatsapp_enabled) values ($1, true)", [U.talent]));
    expect(noNumber.error?.message).toMatch(/alert_preferences_whatsapp_number/);
    await db.query("insert into alert_preferences (user_id) values ($1)", [U.other]).catch(() => {});
    const peek = await asUser(db, U.talent, {}, (tx) => tx.query("select count(*)::int as n from alert_preferences"));
    expect(peek.result.rows[0].n).toBe(0);
  });
});
