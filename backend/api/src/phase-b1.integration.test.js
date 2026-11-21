// Migration 0110: no-ghosting auto-close, the "Viewed" step, pay rules
// for publishing, and the append-only audit log — exercised against the
// real migrations through row-level security.
import { describe, it, expect, beforeAll } from "vitest";
import { bootDb, asUser } from "./testDb.js";

let db;
const U = {
  rep: "00000000-0000-0000-0000-0000000000a1",
  talent: "00000000-0000-0000-0000-0000000000a2",
  talent2: "00000000-0000-0000-0000-0000000000a3",
  stranger: "00000000-0000-0000-0000-0000000000a4",
};
let orgId;
let selfOpp;
let staffOpp;

const as = (uid, opts, fn) => asUser(db, uid, opts, fn);
const one = async (sql, params) => (await db.query(sql, params)).rows[0];

async function newOpportunity(overrides = {}) {
  const o = {
    title: "Brand identity",
    status: "open",
    shortlisting_mode: "self_service",
    payment_basis: "fixed",
    compensation_amount: 100,
    ...overrides,
  };
  return (
    await one(
      `insert into opportunities (organisation_id, type, title, category, skills, work_mode, engagement_type, payment_basis,
         compensation_amount, compensation_min, compensation_max, currency, visibility, status, shortlisting_mode)
       values ($1, 'project', $2, 'creative_media', '{branding}', 'remote', 'freelance', $3, $4, $5, $6, 'SSP', 'public', $7, $8)
       returning id`,
      [orgId, o.title, o.payment_basis, o.compensation_amount ?? null, o.compensation_min ?? null, o.compensation_max ?? null, o.status, o.shortlisting_mode]
    )
  ).id;
}

beforeAll(async () => {
  db = await bootDb();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("update profiles set role = 'individual_client' where id = $1", [U.rep]);
  for (const id of [U.talent, U.talent2]) await db.query("insert into talent_profiles (id) values ($1) on conflict do nothing", [id]);
  orgId = (await one("insert into organisations (name, representative_id, verification_status) values ('Nile Health', $1, 'verified') returning id", [U.rep])).id;
  await db.query("insert into organisation_members (organisation_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing", [orgId, U.rep]);
  selfOpp = await newOpportunity({ shortlisting_mode: "self_service" });
  staffOpp = await newOpportunity({ title: "Assisted role", shortlisting_mode: "staff_assisted" });
}, 120_000);

describe("no-ghosting auto-close (0110 §1)", () => {
  it("closes applications nobody moved for 14 days, tells the talent, and leaves fresh ones and interviews alone", async () => {
    const old = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'submitted') returning id", [selfOpp, U.talent])).id;
    const fresh = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'submitted') returning id", [selfOpp, U.talent2])).id;
    const interview = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'interviewing') returning id", [staffOpp, U.talent])).id;
    // Age two of them past the limit. The clock trigger ignores manual
    // edits, so age it the way time would: disable the trigger briefly.
    await db.exec("alter table applications disable trigger applications_protect_clocks");
    await db.query("update applications set stage_changed_at = now() - interval '15 days' where id = any($1)", [[old, interview]]);
    await db.exec("alter table applications enable trigger applications_protect_clocks");

    const closed = await one("select close_silent_applications() as n");
    expect(closed.n).toBe(1);
    expect((await one("select stage, decision_reason from applications where id = $1", [old])).stage).toBe("rejected");
    expect((await one("select decision_reason from applications where id = $1", [old])).decision_reason).toMatch(/14 days/);
    expect((await one("select stage from applications where id = $1", [fresh])).stage).toBe("submitted");
    expect((await one("select stage from applications where id = $1", [interview])).stage).toBe("interviewing");
    const note = await one("select title, link from notifications where user_id = $1 order by created_at desc limit 1", [U.talent]);
    expect(note.title).toMatch(/closed after 14 days/);
    expect(note.link).toBe("/applications");
  });

  it("only a stage change restarts the 14-day clock — a talent can't reset it by hand", async () => {
    const id = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'submitted') on conflict (opportunity_id, talent_id) do update set stage = 'submitted' returning id", [staffOpp, U.talent2])).id;
    const before = (await one("select stage_changed_at from applications where id = $1", [id])).stage_changed_at;
    await as(U.talent2, {}, (tx) => tx.query("update applications set stage_changed_at = now() + interval '1 year' where id = $1", [id]));
    // as() rolls back, so also try it as the superuser path the trigger guards:
    await db.query("update applications set stage_changed_at = now() + interval '1 year' where id = $1", [id]);
    expect((await one("select stage_changed_at from applications where id = $1", [id])).stage_changed_at).toEqual(before);
  });

  it("can't be run by signed-in users", async () => {
    const { error } = await as(U.stranger, {}, (tx) => tx.query("select close_silent_applications()"));
    expect(error?.message).toMatch(/permission denied/);
  });
});

describe("Viewed step (0110 §2)", () => {
  it("marks applications viewed when their employer opens them", async () => {
    const app = (await one("select id from applications where opportunity_id = $1 and talent_id = $2", [selfOpp, U.talent2])).id;
    const { error, result } = await as(U.rep, {}, (tx) => tx.query("select mark_applications_viewed($1) as n", [selfOpp]));
    expect(error).toBeNull();
    expect(result.rows[0].n).toBeGreaterThan(0);
    // as() rolled back; do it for real to check the column.
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.rep, role: "authenticated" })]);
    await db.query("select mark_applications_viewed($1)", [selfOpp]);
    await db.query("select set_config('request.jwt.claims', '', false)");
    expect((await one("select viewed_at from applications where id = $1", [app])).viewed_at).not.toBeNull();
  });

  it("does not mark staff-assisted 'submitted' rows the employer can't see", async () => {
    const hidden = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'submitted') on conflict (opportunity_id, talent_id) do update set stage = 'submitted' returning id", [staffOpp, U.talent])).id;
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.rep, role: "authenticated" })]);
    await db.query("select mark_applications_viewed($1)", [staffOpp]);
    await db.query("select set_config('request.jwt.claims', '', false)");
    expect((await one("select viewed_at from applications where id = $1", [hidden])).viewed_at).toBeNull();
  });

  it("refuses people outside the organisation", async () => {
    const { error } = await as(U.stranger, {}, (tx) => tx.query("select mark_applications_viewed($1)", [selfOpp]));
    expect(error?.message).toMatch(/Not a member/);
  });

  it("a talent can't fake 'Viewed' on their own application", async () => {
    const id = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'submitted') on conflict (opportunity_id, talent_id) do update set stage = 'submitted' returning id", [staffOpp, U.talent2])).id;
    const { result } = await as(U.talent2, {}, (tx) => tx.query("update applications set viewed_at = now() where id = $1 returning viewed_at", [id]));
    expect(result.rows[0]?.viewed_at ?? null).toBeNull();
  });
});

describe("pay on every opportunity (0110 §3)", () => {
  it("refuses to publish 'negotiable' pay", async () => {
    await expect(newOpportunity({ payment_basis: "negotiable", compensation_amount: null })).rejects.toThrow(/negotiable/);
  });
  it("refuses a minimum without a maximum", async () => {
    await expect(newOpportunity({ compensation_amount: null, compensation_min: 100 })).rejects.toThrow(/needs pay/);
  });
  it("accepts a min–max range", async () => {
    await expect(newOpportunity({ compensation_amount: null, compensation_min: 100, compensation_max: 200 })).resolves.toBeTruthy();
  });
  it("still allows drafts without pay", async () => {
    await expect(newOpportunity({ status: "draft", compensation_amount: null })).resolves.toBeTruthy();
  });
  it("doesn't break unrelated updates to an older negotiable listing", async () => {
    // Before 0110, "negotiable" with an amount could be published.
    const id = await newOpportunity({ status: "draft", payment_basis: "negotiable", compensation_amount: 100 });
    await db.exec("alter table opportunities disable trigger guard_opportunity_pay");
    await db.query("update opportunities set status = 'open' where id = $1", [id]);
    await db.exec("alter table opportunities enable trigger guard_opportunity_pay");
    await expect(db.query("update opportunities set status = 'expired' where id = $1", [id])).resolves.toBeTruthy();
  });
});

describe("append-only audit log (0110 §4)", () => {
  it("refuses edits and deletes, even from the backend", async () => {
    const id = (
      await one("insert into audit_events (name, actor_id, entity_type, entity_id, source) values ('test.event', $1, 'x', 'y', 'platform') returning id", [U.stranger])
    ).id;
    await expect(db.query("update audit_events set name = 'tampered' where id = $1", [id])).rejects.toThrow(/cannot be edited/);
    await expect(db.query("delete from audit_events where id = $1", [id])).rejects.toThrow(/cannot be deleted/);
  });
  it("still lets an account be deleted (the actor is cleared, the event stays)", async () => {
    const id = (
      await one("insert into audit_events (name, actor_id, entity_type, entity_id, source) values ('test.event2', $1, 'x', 'y', 'platform') returning id", [U.stranger])
    ).id;
    await db.query("delete from auth.users where id = $1", [U.stranger]);
    const row = await one("select name, actor_id from audit_events where id = $1", [id]);
    expect(row.name).toBe("test.event2");
    expect(row.actor_id).toBeNull();
  });
});
