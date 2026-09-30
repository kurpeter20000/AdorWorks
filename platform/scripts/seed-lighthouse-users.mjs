#!/usr/bin/env node
// S15-09 — creates (or reuses) two persistent test accounts so the
// authenticated Lighthouse pass (.lighthouserc.authenticated.json) can
// log in as a real user with real, non-empty data. Idempotent: safe to
// re-run. Uses the same .env.e2e.local safety validation as the e2e
// suite — refuses to run against anything but the disposable test
// project. Prints the two credential pairs as shell `export` lines on
// stdout; nothing is written to disk here.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Mirrors src/lib/testing/e2e-environment.ts's validateE2EEnvironment —
// duplicated rather than imported since that file is TypeScript and this
// script runs under plain Node with no TS loader configured. Keep the two
// in sync if the safety rule ever changes.
const KNOWN_PRODUCTION_PROJECT_REFS = new Set(["cpiebggzbxshzvlzqdfn"]);

function projectReference(rawUrl) {
  const url = new URL(rawUrl);
  if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) return "local";
  if (url.protocol !== "https:" || !url.hostname.endsWith(".supabase.co")) {
    throw new Error("Safety check failed: use a Supabase project URL or a local Supabase instance.");
  }
  return url.hostname.slice(0, -".supabase.co".length);
}

function validateE2EEnvironment(environment) {
  if (environment.E2E_ALLOW_MUTATIONS !== "true") {
    throw new Error("Safety check failed: set E2E_ALLOW_MUTATIONS=true for a disposable test project.");
  }
  const url = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const secretKey = environment.SUPABASE_SECRET_KEY?.trim();
  const expectedRef = environment.E2E_EXPECTED_SUPABASE_PROJECT_REF?.trim();
  if (!url || !secretKey || !expectedRef) {
    throw new Error("Safety check failed: the test URL, secret key, and expected project ref are required.");
  }
  const actualRef = projectReference(url);
  if (KNOWN_PRODUCTION_PROJECT_REFS.has(actualRef)) {
    throw new Error("Safety check failed: refusing to mutate the known production Supabase project.");
  }
  if (actualRef !== expectedRef) {
    throw new Error(`Safety check failed: expected project "${expectedRef}" but URL resolves to "${actualRef}".`);
  }
  return { NEXT_PUBLIC_SUPABASE_URL: url, SUPABASE_SECRET_KEY: secretKey };
}

function loadEnv() {
  const envPath = path.resolve(__dirname, "../.env.e2e.local");
  const fileEnvironment = fs.existsSync(envPath)
    ? Object.fromEntries(
        fs
          .readFileSync(envPath, "utf8")
          .split("\n")
          .filter((line) => line.includes("=") && !line.trimStart().startsWith("#"))
          .map((line) => {
            const separator = line.indexOf("=");
            return [line.slice(0, separator).trim(), line.slice(separator + 1).trim()];
          })
      )
    : {};
  return validateE2EEnvironment({ ...fileEnvironment, ...process.env });
}

const env = loadEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PASSWORD = "LighthouseTestPass1234";
const TALENT_EMAIL = "lighthouse-talent@adorworks-test.local";
const EMPLOYER_EMAIL = "lighthouse-employer@adorworks-test.local";

async function findOrCreateUser(email) {
  const { data: existing } = await admin.auth.admin.listUsers();
  const found = existing?.users.find((u) => u.email === email);
  if (found) return found.id;
  const { data, error } = await admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true });
  if (error || !data.user) throw new Error(`Failed to create ${email}: ${error?.message}`);
  return data.user.id;
}

async function ensureTalent() {
  const id = await findOrCreateUser(TALENT_EMAIL);
  await admin.from("profiles").update({ role: "talent" }).eq("id", id);
  const { data: existingProfile } = await admin.from("talent_profiles").select("id").eq("id", id).maybeSingle();
  if (!existingProfile) {
    await admin.from("talent_profiles").insert({
      id,
      display_name: "Lighthouse Talent",
      category: "digital_technology",
      skills: ["React", "Node.js", "Project coordination"],
      work_mode: "remote",
      public_visible: true,
    });
  }
  return id;
}

async function ensureEmployer() {
  const id = await findOrCreateUser(EMPLOYER_EMAIL);
  await admin.from("profiles").update({ role: "individual_client" }).eq("id", id);
  const { data: existingOrg } = await admin.from("organisations").select("id").eq("representative_id", id).maybeSingle();
  if (existingOrg) return { userId: id, orgId: existingOrg.id };
  const { data: org, error } = await admin
    .from("organisations")
    .insert({ name: "Lighthouse Test Org", representative_id: id, verification_status: "verified" })
    .select("id")
    .single();
  if (error || !org) throw new Error(`Failed to create Lighthouse org: ${error?.message}`);
  return { userId: id, orgId: org.id };
}

async function ensureSampleOpportunity(orgId) {
  const { data: existing } = await admin.from("opportunities").select("id").eq("organisation_id", orgId).limit(1).maybeSingle();
  if (existing) return;
  await admin.from("opportunities").insert({
    organisation_id: orgId,
    type: "project",
    title: "Lighthouse Sample Opportunity",
    brief: "Seeded for authenticated performance testing — safe to ignore.",
    category: "digital_technology",
    skills: ["testing"],
    work_mode: "remote",
    engagement_type: "freelance",
    payment_basis: "fixed",
    compensation_amount: 100,
    currency: "SSP",
    visibility: "public",
    status: "open",
  });
}

const talentId = await ensureTalent();
const { orgId } = await ensureEmployer();
await ensureSampleOpportunity(orgId);

console.log(`export LH_TALENT_EMAIL="${TALENT_EMAIL}"`);
console.log(`export LH_TALENT_PASSWORD="${PASSWORD}"`);
console.log(`export LH_EMPLOYER_EMAIL="${EMPLOYER_EMAIL}"`);
console.log(`export LH_EMPLOYER_PASSWORD="${PASSWORD}"`);
console.error(`Ready: talent=${talentId}`);
