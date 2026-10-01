#!/usr/bin/env node
// Compares a live database against what the migration files say it
// should contain, and exits non-zero if anything is missing.
//
// Why: production once ran 34 migrations behind the code for weeks with
// nothing noticing (see the 2026-09-30 decision-log entry) — "merged" was
// never the same as "applied". This replays every migration on a fresh
// in-memory Postgres (PGlite, same shim as verify-clean-migrations.mjs),
// records every table, column, function, policy, trigger, enum value and
// storage bucket that exists at the end, then checks the live database
// for each one.
//
// Read-only by construction: the live queries run inside a READ ONLY
// transaction, so Postgres itself rejects any write.
//
// It checks that objects EXIST, not that their definitions match — a
// policy with the right name but drifted text isn't caught (0070/0093
// were that kind of problem).
//
// Usage: SCHEMA_CHECK_DB_URL=postgresql://... [SCHEMA_CHECK_LABEL=production] node scripts/check-schema-drift.mjs

import { PGlite } from "@electric-sql/pglite";
import { pgcrypto } from "@electric-sql/pglite/contrib/pgcrypto";
import pg from "pg";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { MIGRATIONS_DIR, PLATFORM_SHIM, PG_CRON_EXTENSION_LINE, REALTIME_PUBLICATION_LINE } from "./verify-clean-migrations.mjs";

const SNAPSHOT = `
  select 'table' kind, c.relname obj from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p')
  union all select 'view', c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('v', 'm')
  union all select 'column', c.relname || '.' || a.attname from pg_attribute a
    join pg_class c on c.oid = a.attrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and a.attnum > 0 and not a.attisdropped
  union all select 'function', p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  union all select 'policy', n.nspname || '.' || c.relname || '.' || pol.polname from pg_policy pol
    join pg_class c on c.oid = pol.polrelid join pg_namespace n on n.oid = c.relnamespace
    where n.nspname in ('public', 'storage')
  union all select 'trigger', n.nspname || '.' || c.relname || '.' || t.tgname from pg_trigger t
    join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace
    where not t.tgisinternal and n.nspname in ('public', 'storage')
  union all select 'type', t.typname from pg_type t join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public' and t.typtype = 'e'
  union all select 'enum_value', t.typname || '.' || e.enumlabel from pg_enum e
    join pg_type t on t.oid = e.enumtypid join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
  union all select 'bucket', id from storage.buckets`;

const key = (r) => `${r.kind}|${r.obj}`;

async function expectedObjects() {
  const db = new PGlite({ extensions: { pgcrypto } });
  await db.exec(PLATFORM_SHIM);
  const seen = new Set((await db.query(SNAPSHOT)).rows.map(key));
  const firstSeenIn = new Map();
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const sql = (await readFile(path.join(MIGRATIONS_DIR, file), "utf8")).replace(PG_CRON_EXTENSION_LINE, "").replace(REALTIME_PUBLICATION_LINE, "");
    await db.exec(sql);
    for (const row of (await db.query(SNAPSHOT)).rows) {
      const k = key(row);
      if (!seen.has(k)) {
        seen.add(k);
        firstSeenIn.set(k, file);
      }
    }
  }
  // Only objects that still exist after the last migration — something a
  // later migration deliberately drops isn't expected.
  const final = new Set((await db.query(SNAPSHOT)).rows.map(key));
  return { files, expected: [...firstSeenIn].filter(([k]) => final.has(k)) };
}

async function liveObjects(url) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("begin transaction read only");
    const { rows } = await client.query(SNAPSHOT);
    await client.query("rollback");
    return new Set(rows.map(key));
  } finally {
    await client.end();
  }
}

async function main() {
  const url = process.env.SCHEMA_CHECK_DB_URL;
  const label = process.env.SCHEMA_CHECK_LABEL || "database";
  if (!url) {
    console.error("SCHEMA_CHECK_DB_URL is not set.");
    process.exit(2);
  }

  const { files, expected } = await expectedObjects();
  const live = await liveObjects(url);
  const missing = expected.filter(([k]) => !live.has(k));

  console.log(`Checked ${expected.length} objects from ${files.length} migrations against the ${label} database.`);
  if (missing.length === 0) {
    console.log(`OK — the ${label} database has everything the migrations create.`);
    return;
  }

  const byMigration = new Map();
  for (const [k, file] of missing) {
    if (!byMigration.has(file)) byMigration.set(file, []);
    byMigration.get(file).push(k.replace("|", " "));
  }
  console.log(`\nMISSING on ${label}: ${missing.length} objects across ${byMigration.size} migration(s):`);
  for (const [file, objs] of [...byMigration].sort()) {
    console.log(`  ${file} — ${objs.length} missing, e.g. ${objs.slice(0, 4).join(", ")}`);
    if (process.env.GITHUB_ACTIONS) {
      console.log(`::error title=Schema drift (${label})::${file} is not fully applied (${objs.length} objects missing)`);
    }
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("Schema drift check could not run:", err.message);
  process.exit(2);
});
