// Shared harness for database integration tests: applies every migration
// to PGlite (real Postgres in WASM) with the same platform shim as
// scripts/verify-clean-migrations.mjs, then swaps the auth.* stubs for
// ones that read per-request JWT claims the way Supabase does, so tests
// can act as a real signed-in user through row-level security.
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

export async function bootDb() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PLATFORM_SHIM);
  // Supabase's defaults: anon/authenticated get table + function grants
  // automatically; RLS and explicit revokes are what restrict them.
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
  await db.exec(`
    create or replace function auth.jwt() returns jsonb language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
    create or replace function auth.uid() returns uuid language sql stable as $$
      select nullif(auth.jwt() ->> 'sub', '')::uuid $$;
    create or replace function auth.role() returns text language sql stable as $$
      select coalesce(auth.jwt() ->> 'role', 'service_role') $$;
    grant execute on all functions in schema auth to anon, authenticated;
    alter table auth.users add column if not exists email_confirmed_at timestamptz;
  `);
  return db;
}

/** Run `fn` inside a rolled-back transaction as `uid` (null = anon) through RLS. */
export async function asUser(db, uid, { aal = "aal1" } = {}, fn) {
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
