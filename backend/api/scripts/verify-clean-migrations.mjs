// S15-04 — "run all database migrations from a clean state / a new
// environment reaches the release schema without manual repair."
//
// Verifying this genuinely needs a real, empty Postgres — Docker and a
// local Postgres install are both unavailable in this project's usual
// dev environment, and Supabase's free tier is already at its 2-project
// limit (production + test), so spinning up a third cloud project isn't
// free. PGlite (a real Postgres engine compiled to WASM, no external
// binary or container required) closes that gap for the one thing this
// check actually needs: proving the migration SQL itself, in order,
// reaches the release schema with zero manual intervention.
//
// This is NOT a full Supabase stack — Supabase's own auth/storage
// services, RLS enforcement at the API layer, and real extensions like
// pg_cron aren't present. The shim below provides just enough of that
// platform surface (auth.users, auth.uid()/role()/jwt(), the anon/
// authenticated/service_role roles, storage.buckets/objects and
// storage.foldername(), a minimal cron.job/schedule/unschedule) for
// every migration's DDL to resolve and apply — not to emulate their
// runtime behavior. One line (a literal `create extension pg_cron`,
// migration 0045 only) is skipped for the same reason: pg_cron is a
// real, dashboard-enabled extension on every actual Supabase project,
// just not one PGlite ships.
//
// Usage: node scripts/verify-clean-migrations.mjs
import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(__dirname, "..", "..", "supabase", "migrations");

const PLATFORM_SHIM = `
create extension if not exists pgcrypto;

create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key default gen_random_uuid(),
  email text,
  raw_user_meta_data jsonb default '{}'::jsonb
);
create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create or replace function auth.role() returns text language sql stable as $$ select 'service_role'::text $$;
create or replace function auth.jwt() returns jsonb language sql stable as $$ select '{}'::jsonb $$;

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists (select from pg_roles where rolname = 'service_role') then create role service_role; end if;
end
$$;

create schema if not exists cron;
create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text,
  command text
);
create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint language sql as $$
  insert into cron.job (jobname, schedule, command) values (job_name, schedule, command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command
  returning jobid;
$$;
create or replace function cron.unschedule(job_id bigint)
returns boolean language sql as $$
  delete from cron.job where jobid = job_id; select true;
$$;

create schema if not exists storage;
create table if not exists storage.buckets (
  id text primary key,
  name text not null,
  public boolean default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table if not exists storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets(id),
  name text,
  owner uuid,
  metadata jsonb
);
-- Real Supabase implementation (storage-api's own migrations).
create or replace function storage.foldername(name text)
returns text[] language plpgsql stable as $$
declare
  _parts text[];
begin
  select string_to_array(name, '/') into _parts;
  return _parts[1:array_length(_parts, 1) - 1];
end
$$;
`;

const PG_CRON_EXTENSION_LINE = /^create extension if not exists pg_cron;\s*$/m;

async function main() {
  const db = new PGlite({ extensions: { pgcrypto } });

  console.log("=== Applying platform shim (auth/storage/cron stubs) ===");
  await db.exec(PLATFORM_SHIM);
  console.log("shim OK\n");

  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  console.log(`=== Applying ${files.length} migrations to a fresh instance ===`);

  for (const file of files) {
    let sql = await readFile(path.join(MIGRATIONS_DIR, file), "utf8");
    if (PG_CRON_EXTENSION_LINE.test(sql)) {
      sql = sql.replace(PG_CRON_EXTENSION_LINE, "-- (pg_cron extension line skipped — see this script's own header)\n");
    }
    try {
      await db.exec(sql);
      console.log(`OK    ${file}`);
    } catch (err) {
      console.error(`FAIL  ${file}: ${err.message}`);
      console.error(`\nStopped at ${file} — this needs a real fix, not a shim adjustment,`);
      console.error("unless the failure is specifically about a missing platform-schema");
      console.error("stub this script doesn't yet provide.");
      process.exitCode = 1;
      return;
    }
  }

  const { rows } = await db.query(
    "select count(*) as n from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'"
  );
  console.log(`\nAll ${files.length} migrations applied cleanly to a fresh instance.`);
  console.log(`public tables created: ${rows[0].n}`);
}

main();
