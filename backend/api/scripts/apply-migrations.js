#!/usr/bin/env node
// AdorWorks — apply new migrations from backend/supabase/migrations/ to a
// target database, in order, tracking what's already been applied
// (S02-08).
//
// IMPORTANT — read before running:
// - This connects directly to Postgres and runs schema-changing SQL. It
//   is NOT scoped to a "safe" project the way the app's own admin client
//   is — whatever connection string you give it, it will run DDL against.
//   Never point this at production without knowing exactly what you're
//   doing.
// - Uses a tracking table (_schema_migrations) to only apply files not
//   already recorded as run, rather than blindly re-running the whole
//   history every time. That's a correction, not just a style choice:
//   an earlier version of this script re-ran every file unconditionally,
//   reasoning that each file's own DDL is written to be safe to re-apply
//   (if not exists / drop-then-create patterns throughout). That's true
//   per-file, but not true of the *sequence* as a whole — confirmed live
//   against the test project: migration 0003 defines a view with
//   `create or replace view`, and 0034 later redefines that same view
//   with a different column set. Postgres's CREATE OR REPLACE VIEW can't
//   drop or reorder existing columns, so replaying 0003 a second time
//   against a database that has already moved on to 0034's shape fails
//   with "cannot drop columns from view". A tracking table sidesteps
//   this entirely by never re-running a file once it's applied.
//
// Usage:
//   MIGRATE_TARGET=staging SUPABASE_DB_URL=postgresql://... npm run migrate

import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ALLOWED_TARGETS = ["staging", "test", "local"];
const target = process.env.MIGRATE_TARGET;
if (!ALLOWED_TARGETS.includes(target)) {
  console.error(`Set MIGRATE_TARGET to one of: ${ALLOWED_TARGETS.join(", ")} (not "production" — that stays a manual, reviewed step).`);
  process.exit(1);
}

if (!process.env.SUPABASE_DB_URL) {
  console.error("Missing SUPABASE_DB_URL — the direct Postgres connection string (Project Settings -> Database -> Connection string), not the API URL/keys.");
  process.exit(1);
}

const migrationsDir = path.join(__dirname, "..", "..", "supabase", "migrations");
const files = fs
  .readdirSync(migrationsDir)
  .filter((f) => f.endsWith(".sql"))
  .sort();

async function main() {
  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  await client.query(`
    create table if not exists _schema_migrations (
      filename text primary key,
      applied_at timestamptz not null default now()
    );
  `);

  const { rows } = await client.query("select filename from _schema_migrations");
  const already = new Set(rows.map((r) => r.filename));
  const pending = files.filter((f) => !already.has(f));

  if (pending.length === 0) {
    console.log(`Target "${target}" is already up to date — all ${files.length} migrations previously applied.`);
    await client.end();
    return;
  }

  console.log(`Target "${target}": ${already.size} already applied, ${pending.length} pending. Applying now...`);

  for (const file of pending) {
    const sql = fs.readFileSync(path.join(migrationsDir, file), "utf8");
    try {
      await client.query(sql);
      await client.query("insert into _schema_migrations (filename) values ($1)", [file]);
      console.log(`  OK    ${file}`);
    } catch (err) {
      console.error(`  FAIL  ${file} - ${err.message}`);
      await client.end();
      process.exit(1);
    }
  }

  await client.end();
  console.log(`\nApplied ${pending.length} new migration(s) to "${target}". Total now: ${files.length}.`);
}

main().catch((err) => {
  console.error("Migration run failed:", err.message);
  process.exit(1);
});
