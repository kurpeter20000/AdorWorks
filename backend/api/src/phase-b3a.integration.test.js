// Migration 0112: fields-to-fix, suspension appeals and staff notes,
// exercised through row-level security against the real migrations.
import { describe, it, expect, beforeAll } from "vitest";
import { bootDb, asUser } from "./testDb.js";

let db;
const U = {
  staff: "00000000-0000-0000-0000-0000000000c1",
  rep: "00000000-0000-0000-0000-0000000000c2",
  talent: "00000000-0000-0000-0000-0000000000c3",
  gone: "00000000-0000-0000-0000-0000000000c4",
};
const one = async (sql, p) => (await db.query(sql, p)).rows[0];

beforeAll(async () => {
  db = await bootDb();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("update profiles set role = 'trust_safety' where id = $1", [U.staff]);
  await db.query("update profiles set role = 'individual_client' where id = $1", [U.rep]);
}, 120_000);

describe("fields to fix (0112 §1)", () => {
  it("clears the list when the employer resubmits", async () => {
    const org = (await one("insert into organisations (name, representative_id) values ('Nile Health', $1) returning id", [U.rep])).id;
    const opp = (
      await one(
        `insert into opportunities (organisation_id, type, title, category, skills, work_mode, engagement_type, payment_basis, compensation_amount, currency, visibility, status)
         values ($1, 'project', 'Logo', 'creative_media', '{branding}', 'remote', 'freelance', 'fixed', 100, 'SSP', 'public', 'changes_required') returning id`,
        [org]
      )
    ).id;
    await db.query("update opportunities set changes_fields = '{pay,contact}' where id = $1", [opp]);
    expect((await one("select changes_fields from opportunities where id = $1", [opp])).changes_fields).toEqual(["pay", "contact"]);
    await db.query("update opportunities set status = 'pending_review' where id = $1", [opp]);
    expect((await one("select changes_fields from opportunities where id = $1", [opp])).changes_fields).toEqual([]);
  });
});

describe("suspension appeals (0112 §2)", () => {
  it("only the backend can file or decide an appeal", async () => {
    const { error } = await asUser(db, U.talent, {}, (tx) => tx.query("insert into account_appeals (profile_id, message) values ($1, 'Please look again at my account.')", [U.talent]));
    expect(error?.message).toMatch(/permission denied|row-level security/);
  });

  it("staff with MFA can read appeals; others can't", async () => {
    await db.query("insert into account_appeals (profile_id, message) values ($1, 'Please look again at my account.')", [U.talent]);
    const staff = await asUser(db, U.staff, { aal: "aal2" }, (tx) => tx.query("select count(*)::int as n from account_appeals"));
    expect(staff.result.rows[0].n).toBe(1);
    const noMfa = await asUser(db, U.staff, { aal: "aal1" }, (tx) => tx.query("select count(*)::int as n from account_appeals"));
    expect(noMfa.result.rows[0].n).toBe(0);
    const talent = await asUser(db, U.talent, {}, (tx) => tx.query("select count(*)::int as n from account_appeals"));
    expect(talent.result.rows[0].n).toBe(0);
  });

  it("keeps one open appeal per person", async () => {
    await expect(db.query("insert into account_appeals (profile_id, message) values ($1, 'A second appeal at once.')", [U.talent])).rejects.toThrow(/duplicate|unique/);
  });
});

describe("staff notes (0112 §3)", () => {
  it("staff add notes as themselves; nobody else can read them", async () => {
    const ok = await asUser(db, U.staff, { aal: "aal2" }, (tx) =>
      tx.query("insert into staff_notes (subject_id, author_id, body) values ($1, $2, 'Called about upload problem.') returning id", [U.talent, U.staff])
    );
    expect(ok.error).toBeNull();
    const forged = await asUser(db, U.staff, { aal: "aal2" }, (tx) =>
      tx.query("insert into staff_notes (subject_id, author_id, body) values ($1, $2, 'Pretending to be someone else.')", [U.talent, U.rep])
    );
    expect(forged.error?.message).toMatch(/row-level security/);
    const peek = await asUser(db, U.talent, {}, (tx) => tx.query("select count(*)::int as n from staff_notes"));
    expect(peek.result.rows[0].n).toBe(0);
  });

  it("can't be edited or deleted, even by the backend", async () => {
    const id = (await one("insert into staff_notes (subject_id, author_id, body) values ($1, $2, 'Original note.') returning id", [U.talent, U.staff])).id;
    await expect(db.query("update staff_notes set body = 'rewritten' where id = $1", [id])).rejects.toThrow(/cannot be edited/);
    await expect(db.query("delete from staff_notes where id = $1", [id])).rejects.toThrow(/cannot be deleted/);
  });

  it("go away with the person's account when it is deleted", async () => {
    await db.query("insert into staff_notes (subject_id, author_id, body) values ($1, $2, 'Note about someone leaving.')", [U.gone, U.staff]);
    await db.query("delete from auth.users where id = $1", [U.gone]);
    expect((await one("select count(*)::int as n from staff_notes where subject_id = $1", [U.gone])).n).toBe(0);
  });

  it("stay when their author's account is deleted", async () => {
    const author = "00000000-0000-0000-0000-0000000000c5";
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 'author@example.test', '{}')", [author]);
    const id = (await one("insert into staff_notes (subject_id, author_id, body) values ($1, $2, 'Written by someone who left.') returning id", [U.talent, author])).id;
    await db.query("delete from auth.users where id = $1", [author]);
    expect((await one("select author_id from staff_notes where id = $1", [id])).author_id).toBeNull();
  });
});
