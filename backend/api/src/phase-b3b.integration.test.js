// Migration 0113: offer deadlines, contract signing and interview slots,
// through row-level security against the real migrations.
import { describe, it, expect, beforeAll } from "vitest";
import { bootDb, asUser } from "./testDb.js";

let db;
const U = {
  rep: "00000000-0000-0000-0000-0000000000d1",
  talent: "00000000-0000-0000-0000-0000000000d2",
  other: "00000000-0000-0000-0000-0000000000d3",
  matcher: "00000000-0000-0000-0000-0000000000d4",
};
let org, opp, app;
const one = async (sql, p) => (await db.query(sql, p)).rows[0];
const asTalent = (fn) => asUser(db, U.talent, {}, fn);
const asRep = (fn) => asUser(db, U.rep, {}, fn);
const hours = (h) => new Date(Date.now() + h * 3_600_000).toISOString();

beforeAll(async () => {
  db = await bootDb();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("update profiles set role = 'individual_client' where id = $1", [U.rep]);
  await db.query("update profiles set role = 'matcher' where id = $1", [U.matcher]);
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
}, 120_000);

describe("offer deadlines (0113 §1)", () => {
  it("gives every sent offer a deadline and refuses acceptance after it", async () => {
    const offer = (
      await one(
        `insert into offers (application_id, opportunity_id, talent_id, organisation_id, payment_basis, compensation_amount, currency, status, created_by)
         values ($1, $2, $3, $4, 'fixed', 100, 'SSP', 'sent', $5) returning id, expires_at`,
        [app, opp, U.talent, org, U.rep]
      )
    );
    expect(offer.expires_at).not.toBeNull();
    await db.query("update offers set expires_at = now() - interval '1 minute' where id = $1", [offer.id]);
    await expect(db.query("update offers set status = 'accepted' where id = $1", [offer.id])).rejects.toThrow(/expired/);
    await db.query("update offers set expires_at = now() + interval '1 day' where id = $1", [offer.id]);
    await expect(db.query("update offers set status = 'declined' where id = $1", [offer.id])).resolves.toBeTruthy();
  });
});

describe("contract signing (0113 §2)", () => {
  let contract;
  beforeAll(async () => {
    const offer = (
      await one(
        `insert into offers (application_id, opportunity_id, talent_id, organisation_id, payment_basis, compensation_amount, currency, status, created_by)
         values ($1, $2, $3, $4, 'fixed', 100, 'SSP', 'accepted', $5) returning id`,
        [app, opp, U.talent, org, U.rep]
      )
    ).id;
    contract = (await one("insert into contracts (offer_id, opportunity_id, talent_id, organisation_id) values ($1, $2, $3, $4) returning id", [offer, opp, U.talent, org])).id;
  });

  it("asks for the written terms first", async () => {
    const { error } = await asTalent((tx) => tx.query("select sign_contract($1)", [contract]));
    expect(error?.message).toMatch(/not ready/);
  });

  it("records each side's signature against the terms version", async () => {
    await db.query("insert into contract_terms (contract_id, version, content, content_hash) values ($1, 1, '{}', 'abc123')", [contract]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.talent, role: "authenticated" })]);
    await db.query("select sign_contract($1)", [contract]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.rep, role: "authenticated" })]);
    await db.query("select sign_contract($1)", [contract]);
    await db.query("select sign_contract($1)", [contract]); // twice is harmless
    await db.query("select set_config('request.jwt.claims', '', false)");
    const rows = (await db.query("select party, terms_version, content_hash from contract_signatures where contract_id = $1 order by party", [contract])).rows;
    expect(rows).toEqual([
      { party: "organisation", terms_version: 1, content_hash: "abc123" },
      { party: "talent", terms_version: 1, content_hash: "abc123" },
    ]);
  });

  it("refuses anyone not in the contract, and direct writes", async () => {
    const outsider = await asUser(db, U.other, {}, (tx) => tx.query("select sign_contract($1)", [contract]));
    expect(outsider.error?.message).toMatch(/Only the people named/);
    const direct = await asTalent((tx) => tx.query("insert into contract_signatures (contract_id, terms_version, content_hash, party) values ($1, 9, 'x', 'talent')", [contract]));
    expect(direct.error?.message).toMatch(/permission denied/);
  });
});

describe("interview slots (0113 §3)", () => {
  it("lets the employer offer times and the talent pick one, moving to interview", async () => {
    const slots = JSON.stringify([{ starts_at: hours(48), mode: "video" }, { starts_at: hours(72), mode: "phone" }]);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.rep, role: "authenticated" })]);
    const offered = (await db.query("select * from offer_interview_slots($1, $2::jsonb)", [app, slots])).rows;
    expect(offered).toHaveLength(2);
    await db.query("select set_config('request.jwt.claims', $1, false)", [JSON.stringify({ sub: U.talent, role: "authenticated" })]);
    await db.query("select choose_interview_slot($1)", [offered[1].id]);
    await db.query("select set_config('request.jwt.claims', '', false)");
    const a = await one("select stage, interview_scheduled_at from applications where id = $1", [app]);
    expect(a.stage).toBe("interviewing");
    expect(new Date(a.interview_scheduled_at).toISOString()).toBe(new Date(offered[1].starts_at).toISOString());
    const statuses = (await db.query("select status from interview_slots where application_id = $1 order by starts_at", [app])).rows.map((r) => r.status);
    expect(statuses).toEqual(["declined", "chosen"]);
    const note = await one("select title from notifications where user_id = $1 order by created_at desc limit 1", [U.rep]);
    expect(note.title).toMatch(/picked an interview time/);
  });

  it("refuses strangers, past times and picking someone else's slot", async () => {
    const stranger = await asUser(db, U.other, {}, (tx) => tx.query("select offer_interview_slots($1, $2::jsonb)", [app, JSON.stringify([{ starts_at: hours(30) }])]));
    expect(stranger.error?.message).toMatch(/can't schedule/);
    const past = await asRep((tx) => tx.query("select offer_interview_slots($1, $2::jsonb)", [app, JSON.stringify([{ starts_at: hours(0.5) }])]));
    expect(past.error?.message).toMatch(/at least an hour/);
    const slot = (await one("select id from interview_slots where application_id = $1 limit 1", [app])).id;
    const notMine = await asUser(db, U.other, {}, (tx) => tx.query("select choose_interview_slot($1)", [slot]));
    expect(notMine.error?.message).toMatch(/isn't yours/);
  });

  it("lets a matcher (staff) offer times on a staff-assisted role", async () => {
    const r = await asUser(db, U.matcher, { aal: "aal2" }, (tx) => tx.query("select count(*)::int as n from offer_interview_slots($1, $2::jsonb)", [app, JSON.stringify([{ starts_at: hours(40) }])]));
    expect(r.error).toBeNull();
    expect(r.result.rows[0].n).toBe(1);
  });

  it("sends each reminder once, to both sides", async () => {
    await db.query("update interview_slots set status = 'cancelled' where application_id = $1", [app]);
    await db.query("insert into interview_slots (application_id, starts_at, status) values ($1, now() + interval '20 hours', 'chosen')", [app]);
    expect((await one("select send_interview_reminders() as n")).n).toBe(1);
    expect((await one("select send_interview_reminders() as n")).n).toBe(0);
    const t = await one("select title from notifications where user_id = $1 and type = 'interview_reminder' order by created_at desc limit 1", [U.talent]);
    expect(t.title).toMatch(/tomorrow/);
    await db.query("update interview_slots set starts_at = now() + interval '30 minutes' where application_id = $1 and status = 'chosen'", [app]);
    expect((await one("select send_interview_reminders() as n")).n).toBe(1);
    expect((await one("select send_interview_reminders() as n")).n).toBe(0);
  });

  it("only staff, the talent and the organisation can see the slots", async () => {
    const outsider = await asUser(db, U.other, {}, (tx) => tx.query("select count(*)::int as n from interview_slots"));
    expect(outsider.result.rows[0].n).toBe(0);
    const talent = await asTalent((tx) => tx.query("select count(*)::int as n from interview_slots"));
    expect(talent.result.rows[0].n).toBeGreaterThan(0);
  });
});
