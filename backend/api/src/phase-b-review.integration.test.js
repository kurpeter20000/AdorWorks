// Migration 0115: fixes from the Phase B review.
import { describe, it, expect, beforeAll } from "vitest";
import { bootDb, asUser } from "./testDb.js";

let db;
const U = {
  rep: "00000000-0000-0000-0000-0000000001a1",
  talent: "00000000-0000-0000-0000-0000000001a2",
  field: "00000000-0000-0000-0000-0000000001a3",
  verifier: "00000000-0000-0000-0000-0000000001a4",
};
let org, opp, app, offer, contract;
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const hours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();
const as = (uid, sql, p) => db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: uid, role: "authenticated" })]).then(() => db.query(sql, p)).finally(() => db.query("select set_config('request.jwt.claims', '', false)"));

beforeAll(async () => {
  db = await bootDb();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("update profiles set role = 'individual_client' where id = $1", [U.rep]);
  await db.query("update profiles set role = 'field_support' where id = $1", [U.field]);
  await db.query("update profiles set role = 'verifier' where id = $1", [U.verifier]);
  await db.query("insert into talent_profiles (id) values ($1) on conflict do nothing", [U.talent]);
  org = (await one("insert into organisations (name, representative_id, verification_status) values ('Nile Health', $1, 'verified') returning id", [U.rep])).id;
  await db.query("insert into organisation_members (organisation_id, user_id, role) values ($1, $2, 'admin') on conflict do nothing", [org, U.rep]);
  opp = (
    await one(
      `insert into opportunities (organisation_id, type, title, category, skills, work_mode, engagement_type, payment_basis, compensation_amount, currency, visibility, status, shortlisting_mode)
       values ($1, 'project', 'Logo', 'creative_media', '{branding}', 'remote', 'freelance', 'fixed', 100, 'SSP', 'public', 'open', 'self_service') returning id`,
      [org]
    )
  ).id;
  app = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'shortlisted') returning id", [opp, U.talent])).id;
  offer = (
    await one(
      `insert into offers (application_id, opportunity_id, talent_id, organisation_id, payment_basis, compensation_amount, currency, status, created_by)
       values ($1, $2, $3, $4, 'fixed', 100, 'SSP', 'accepted', $5) returning id`,
      [app, opp, U.talent, org, U.rep]
    )
  ).id;
  contract = (await one("insert into contracts (offer_id, opportunity_id, talent_id, organisation_id) values ($1, $2, $3, $4) returning id", [offer, opp, U.talent, org])).id;
}, 120_000);

describe("support roles are read-only in the database", () => {
  it("field support can't change offers or applications directly", async () => {
    const r = await asUser(db, U.field, { aal: "aal2" }, (tx) => tx.query("update offers set compensation_amount = 1 where id = $1 returning id", [offer]));
    expect(r.result?.rows ?? []).toHaveLength(0);
    const a = await asUser(db, U.field, { aal: "aal2" }, (tx) => tx.query("update applications set stage = 'rejected' where id = $1 returning id", [app]));
    expect(a.result?.rows ?? []).toHaveLength(0);
  });
  it("field support reads support conversations; verifier reads verification queues", async () => {
    await db.query("insert into conversations (support_user_id) values ($1)", [U.talent]);
    const f = await asUser(db, U.field, { aal: "aal2" }, (tx) => tx.query("select count(*)::int as n from conversations where support_user_id is not null"));
    expect(f.result.rows[0].n).toBe(1);
    await db.query("insert into talent_evidence (talent_id, evidence_type) values ($1, 'identity')", [U.talent]);
    const v = await asUser(db, U.verifier, { aal: "aal2" }, (tx) => tx.query("select count(*)::int as n from talent_evidence"));
    expect(v.result.rows[0].n).toBe(1);
    const noMfa = await asUser(db, U.verifier, { aal: "aal1" }, (tx) => tx.query("select count(*)::int as n from talent_evidence"));
    expect(noMfa.result.rows[0].n).toBe(0);
  });
});

describe("signing the version you read", () => {
  it("refuses an out-of-date version and inactive contracts", async () => {
    await db.query("insert into contract_terms (contract_id, version, content, content_hash) values ($1, 1, '{}', 'v1'), ($1, 2, '{}', 'v2')", [contract]);
    await expect(as(U.talent, "select sign_contract($1, 1)", [contract])).rejects.toThrow(/terms changed/);
    await expect(as(U.talent, "select sign_contract($1, 2)", [contract])).resolves.toBeTruthy();
    await db.query("update contracts set status = 'cancelled' where id = $1", [contract]);
    await expect(as(U.rep, "select sign_contract($1, 2)", [contract])).rejects.toThrow(/active/);
  });
});

describe("interview times follow the application", () => {
  it("cancels times when the application leaves the interview stage, and sends no reminders", async () => {
    await as(U.rep, "select offer_interview_slots($1, $2::jsonb)", [app, JSON.stringify([{ starts_at: hours(5) }])]);
    const slot = (await one("select id from interview_slots where application_id = $1 and status = 'offered'", [app])).id;
    await as(U.talent, "select choose_interview_slot($1)", [slot]);
    await db.query("update interview_slots set starts_at = now() + interval '30 minutes' where id = $1", [slot]);
    await db.query("update applications set stage = 'withdrawn' where id = $1", [app]);
    expect((await one("select status from interview_slots where id = $1", [slot])).status).toBe("cancelled");
    expect((await one("select send_interview_reminders() as n")).n).toBe(0);
  });

  it("a reschedule clears the old booked time", async () => {
    await db.query("update applications set stage = 'shortlisted' where id = $1", [app]);
    await as(U.rep, "select offer_interview_slots($1, $2::jsonb)", [app, JSON.stringify([{ starts_at: hours(30) }])]);
    const slot = (await one("select id from interview_slots where application_id = $1 and status = 'offered'", [app])).id;
    await as(U.talent, "select choose_interview_slot($1)", [slot]);
    expect((await one("select interview_scheduled_at from applications where id = $1", [app])).interview_scheduled_at).not.toBeNull();
    await as(U.rep, "select offer_interview_slots($1, $2::jsonb)", [app, JSON.stringify([{ starts_at: hours(50) }])]);
    expect((await one("select interview_scheduled_at from applications where id = $1", [app])).interview_scheduled_at).toBeNull();
    await expect(as(U.talent, "select choose_interview_slot($1)", [slot])).rejects.toThrow(/no longer available/);
  });
});

describe("14-day close", () => {
  it("waits while interview times are on offer, with a neutral note", async () => {
    const t2 = "00000000-0000-0000-0000-0000000001a5";
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, 't2@example.test', '{}')", [t2]);
    await db.query("insert into talent_profiles (id) values ($1) on conflict do nothing", [t2]);
    const old = (await one("insert into applications (opportunity_id, talent_id, stage) values ($1, $2, 'submitted') returning id", [opp, t2])).id;
    // Back on the shortlist (still in the interview steps, so its offered
    // time stays), then both look 15 days old.
    await db.query("update applications set stage = 'shortlisted' where id = $1", [app]);
    expect((await one("select count(*)::int as n from interview_slots where application_id = $1 and status = 'offered'", [app])).n).toBe(1);
    await db.exec("alter table applications disable trigger applications_protect_clocks");
    await db.query("update applications set stage_changed_at = now() - interval '15 days' where id = any($1)", [[old, app]]);
    await db.exec("alter table applications enable trigger applications_protect_clocks");
    await db.query("select close_silent_applications()");
    expect((await one("select stage from applications where id = $1", [app])).stage).toBe("shortlisted"); // times on offer
    const closed = await one("select stage, decision_reason from applications where id = $1", [old]);
    expect(closed.stage).toBe("rejected");
    expect(closed.decision_reason).toMatch(/No decision was made/);
  });
});
