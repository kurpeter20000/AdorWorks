// Migration 0111: the three new staff roles are real staff to the
// database — MFA still required — and stay anonymous ("AdorWorks") in the
// employer's activity feed.
import { describe, it, expect, beforeAll } from "vitest";
import { bootDb, asUser } from "./testDb.js";

let db;
const U = {
  verifier: "00000000-0000-0000-0000-0000000000b1",
  trust: "00000000-0000-0000-0000-0000000000b2",
  field: "00000000-0000-0000-0000-0000000000b3",
  rep: "00000000-0000-0000-0000-0000000000b4",
  talent: "00000000-0000-0000-0000-0000000000b5",
};
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

beforeAll(async () => {
  db = await bootDb();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("update profiles set role = 'verifier', full_name = 'Vera Verifier' where id = $1", [U.verifier]);
  await db.query("update profiles set role = 'trust_safety' where id = $1", [U.trust]);
  await db.query("update profiles set role = 'field_support' where id = $1", [U.field]);
  await db.query("update profiles set role = 'individual_client' where id = $1", [U.rep]);
}, 120_000);

describe("new staff roles (0111)", () => {
  it("trust & safety is full staff once MFA is done; the support roles are not (0115)", async () => {
    for (const id of [U.verifier, U.field]) {
      const { result } = await asUser(db, id, { aal: "aal2" }, (tx) => tx.query("select is_staff() as ok"));
      expect(result.rows[0].ok).toBe(false);
    }
    for (const id of [U.trust]) {
      const { result, error } = await asUser(db, id, { aal: "aal2" }, (tx) => tx.query("select is_staff() as ok"));
      expect(error).toBeNull();
      expect(result.rows[0].ok).toBe(true);
    }
  });

  it("are not staff without MFA", async () => {
    const { result } = await asUser(db, U.verifier, { aal: "aal1" }, (tx) => tx.query("select is_staff() as ok"));
    expect(result.rows[0].ok).toBe(false);
  });

  it("other accounts are still not staff", async () => {
    for (const id of [U.rep, U.talent]) {
      const { result } = await asUser(db, id, { aal: "aal2" }, (tx) => tx.query("select is_staff() as ok"));
      expect(result.rows[0].ok).toBe(false);
    }
  });

  it("can't promote themselves to admin", async () => {
    const { error } = await asUser(db, U.verifier, { aal: "aal2" }, (tx) => tx.query("update profiles set role = 'admin' where id = $1", [U.verifier]));
    const role = (await one("select role from profiles where id = $1", [U.verifier])).role;
    expect(role).toBe("verifier");
    expect(error === null || /permission|not allowed|role/i.test(error.message)).toBe(true);
  });

  it("show as AdorWorks, not by name, in the employer's activity feed", async () => {
    const orgId = (await one("insert into organisations (name, representative_id) values ('Nile Health', $1) returning id", [U.rep])).id;
    await db.query("insert into organisation_members (organisation_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing", [orgId, U.rep]);
    const opp = (
      await one(
        `insert into opportunities (organisation_id, type, title, category, skills, work_mode, engagement_type, payment_basis, compensation_amount, currency, visibility, status)
         values ($1, 'project', 'Logo', 'creative_media', '{branding}', 'remote', 'freelance', 'fixed', 100, 'SSP', 'public', 'draft') returning id`,
        [orgId]
      )
    ).id;
    await db.query("insert into audit_events (name, actor_id, entity_type, entity_id, source) values ('opportunity.rejected', $1, 'opportunities', $2, 'platform')", [U.verifier, opp]);
    const { result, error } = await asUser(db, U.rep, {}, (tx) => tx.query("select actor_is_staff from organisation_activity_log(50) where name = 'opportunity.rejected'"));
    expect(error).toBeNull();
    expect(result.rows[0].actor_is_staff).toBe(true);
  });
});
