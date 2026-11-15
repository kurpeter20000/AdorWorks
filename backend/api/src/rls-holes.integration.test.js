// Attack tests for the database layer (migration 0109). Each test logs in
// as a real role through RLS — the way anyone holding the public anon key
// plus their own JWT can call PostgREST directly, skipping Express — and
// attempts one of the holes 0109 closes.
//
// Runs every migration on PGlite (real Postgres in WASM), using the same
// platform shim as scripts/verify-clean-migrations.mjs, then swaps the
// auth.* stubs for ones that read per-request JWT claims like Supabase.
import { describe, it, expect, beforeAll } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import {
  MIGRATIONS_DIR,
  PLATFORM_SHIM,
  PG_CRON_EXTENSION_LINE,
  REALTIME_PUBLICATION_LINE,
} from "../scripts/verify-clean-migrations.mjs";

let db;
const U = {
  admin: "00000000-0000-0000-0000-00000000000a",
  reviewer: "00000000-0000-0000-0000-00000000000b",
  suspended: "00000000-0000-0000-0000-00000000000c",
  talent: "00000000-0000-0000-0000-00000000000d",
  voucher: "00000000-0000-0000-0000-00000000000e",
  stranger: "00000000-0000-0000-0000-00000000000f",
};

/** Run `fn` inside a transaction as `uid` (null = anon) through RLS. */
async function as(uid, { aal = "aal1" } = {}, fn) {
  let result;
  let error = null;
  try {
    await db.transaction(async (tx) => {
      const role = uid ? "authenticated" : "anon";
      const claims = JSON.stringify(uid ? { sub: uid, role, aal } : { role });
      await tx.query("select set_config('request.jwt.claims', $1, true)", [claims]);
      await tx.exec(`set local role ${role}`);
      result = await fn(tx);
      throw new Error("__rollback__");
    });
  } catch (e) {
    if (e.message !== "__rollback__") error = e;
  }
  return { result, error };
}

beforeAll(async () => {
  db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PLATFORM_SHIM);
  // Supabase's defaults: anon/authenticated get table + function grants
  // automatically, and RLS / explicit revokes are what actually restrict them.
  await db.exec(`
    grant usage on schema public, auth, storage to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    alter default privileges in schema public grant all on sequences to anon, authenticated;
    alter default privileges in schema public grant execute on functions to anon, authenticated;
  `);
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = (await readFile(path.join(MIGRATIONS_DIR, file), "utf8"))
      .replace(PG_CRON_EXTENSION_LINE, "")
      .replace(REALTIME_PUBLICATION_LINE, "");
    await db.exec(sql);
  }
  // Real-Supabase-like auth helpers driven by request.jwt.claims.
  await db.exec(`
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(auth.jwt() ->> 'role', 'service_role') $$;
    grant execute on all functions in schema auth to anon, authenticated;
  `);

  // Seed as the superuser (auth.role() = 'service_role' with no claims).
  await db.exec("alter table auth.users add column if not exists email_confirmed_at timestamptz");
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{}')", [id, `${name}@example.test`]);
  }
  await db.query("update profiles set full_name = 'Name ' || id::text");
  await db.query("update profiles set role = 'admin' where id = $1", [U.admin]);
  await db.query("update profiles set role = 'reviewer' where id in ($1, $2)", [U.reviewer, U.suspended]);
  await db.query("update profiles set status = 'suspended' where id = $1", [U.suspended]);
  await db.query("insert into talent_profiles (id) values ($1) on conflict do nothing", [U.talent]);
  await db.query("insert into vouches (talent_id, voucher_id, relationship) values ($1, $2, 'Former manager')", [U.talent, U.voucher]);
  await db.query("insert into intake_submissions (form_type, payload) values ('general_contact', '{\"name\":\"x\"}')");
}, 120_000);

describe("profile role/status (0109 §1)", () => {
  it("a staff member cannot make themselves admin, even with MFA", async () => {
    const { error } = await as(U.reviewer, { aal: "aal2" }, (tx) =>
      tx.query("update profiles set role = 'admin' where id = $1", [U.reviewer])
    );
    expect(error?.message).toMatch(/staff console/);
  });

  it("an admin cannot change another user's status by writing to the database directly", async () => {
    const { error } = await as(U.admin, { aal: "aal2" }, (tx) =>
      tx.query("update profiles set status = 'active' where id = $1", [U.suspended])
    );
    expect(error?.message).toMatch(/staff console/);
  });

  it("still lets a new user switch between talent and client at signup", async () => {
    const { error, result } = await as(U.talent, {}, (tx) =>
      tx.query("update profiles set role = 'individual_client' where id = $1 returning role", [U.talent])
    );
    expect(error).toBeNull();
    expect(result.rows[0].role).toBe("individual_client");
  });
});

describe("staff RLS needs MFA and an active account (0109 §2)", () => {
  const countIntake = (tx) => tx.query("select count(*)::int as n from intake_submissions");

  it("a staff password without MFA (aal1) sees no intake submissions", async () => {
    const { result } = await as(U.reviewer, { aal: "aal1" }, countIntake);
    expect(result.rows[0].n).toBe(0);
  });

  it("the same staff member with MFA (aal2) does", async () => {
    const { result } = await as(U.reviewer, { aal: "aal2" }, countIntake);
    expect(result.rows[0].n).toBeGreaterThan(0);
  });

  it("a suspended staff member sees nothing, even with MFA", async () => {
    const { result } = await as(U.suspended, { aal: "aal2" }, countIntake);
    expect(result.rows[0].n).toBe(0);
  });
});

describe("check_rate_limit (0109 §3)", () => {
  it("anonymous callers cannot call it", async () => {
    const { error } = await as(null, {}, (tx) => tx.query("select check_rate_limit('login', 'victim@x', 15, 5)"));
    expect(error?.message).toMatch(/permission denied/);
  });

  it("signed-in users cannot call it", async () => {
    const { error } = await as(U.stranger, {}, (tx) => tx.query("select check_rate_limit('login', 'victim@x', 0, 5)"));
    expect(error?.message).toMatch(/permission denied/);
  });
});

describe("real names (0109 §4)", () => {
  const names = (tx) => tx.query("select id from public_profile_names");

  it("a stranger sees only their own name", async () => {
    const { result } = await as(U.stranger, {}, names);
    expect(result.rows.map((r) => r.id)).toEqual([U.stranger]);
  });

  it("the talent sees their voucher, and the voucher sees the talent", async () => {
    const t = await as(U.talent, {}, names);
    expect(t.result.rows.map((r) => r.id).sort()).toEqual([U.talent, U.voucher].sort());
    const v = await as(U.voucher, {}, names);
    expect(v.result.rows.map((r) => r.id).sort()).toEqual([U.talent, U.voucher].sort());
  });
});

describe("vouches (0109 §5)", () => {
  it("a voucher cannot redirect, rewrite or self-confirm a vouch directly", async () => {
    const { result } = await as(U.voucher, {}, (tx) =>
      tx.query("update vouches set talent_id = $1, statement = 'abuse', status = 'confirmed' where voucher_id = $2 returning id", [U.stranger, U.voucher])
    );
    expect(result.rows).toHaveLength(0);
  });
});

describe("public intake inserts (0109 §6)", () => {
  it("anonymous visitors can still submit a normal form", async () => {
    const { error } = await as(null, {}, (tx) =>
      tx.query("insert into intake_submissions (form_type, payload) values ('general_contact', '{\"name\":\"ok\"}')")
    );
    expect(error).toBeNull();
  });

  it("but cannot submit one pre-marked as converted", async () => {
    const { error } = await as(null, {}, (tx) =>
      tx.query("insert into intake_submissions (form_type, payload, status) values ('general_contact', '{}', 'converted')")
    );
    expect(error?.message).toMatch(/row-level security/);
  });

  it("or one with an oversized payload", async () => {
    const big = JSON.stringify({ x: "a".repeat(40_000) });
    const { error } = await as(null, {}, (tx) =>
      tx.query("insert into intake_submissions (form_type, payload) values ('general_contact', $1::jsonb)", [big])
    );
    expect(error?.message).toMatch(/row-level security/);
  });
});
