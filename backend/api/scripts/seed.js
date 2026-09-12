#!/usr/bin/env node
// AdorWorks — representative seed data for local development (S02-06).
//
// IMPORTANT — read before running:
// - This writes real rows via the service_role admin client, bypassing
//   RLS entirely. Never point it at a project with real user data —
//   local/dev projects only. There is no dedicated staging or test
//   Supabase project yet (see docs/local-development-setup.md); until
//   one exists, only run this against a throwaway project you created
//   yourself for local development.
// - Written directly from the schema and the same auth.admin.createUser
//   + profile-update pattern already used in
//   src/routes/assistedOnboarding.js and src/routes/intake.js — but this
//   script itself has NOT been run against a live database in this
//   session (no test project was available to verify it against). Run
//   it once locally and read the output before trusting it.
// - Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (same as the API
//   itself, see .env.example) plus an explicit confirmation flag so this
//   can never run by accident: SEED_CONFIRM=yes-seed-this-database.
//
// Usage:
//   SEED_CONFIRM=yes-seed-this-database npm run seed

import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

if (process.env.SEED_CONFIRM !== "yes-seed-this-database") {
  console.error(
    "Refusing to run: set SEED_CONFIRM=yes-seed-this-database to confirm you're targeting a throwaway project, not one with real data."
  );
  process.exit(1);
}

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — copy .env.example to .env and fill it in first.");
  process.exit(1);
}

const supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_PASSWORD = "SeedData!2026"; // local development only — never used for a real account

// auth.users insert triggers handle_new_auth_user (migration 0003), which
// auto-creates the matching profiles row with role='talent' by default —
// we update role/status afterward rather than insert a second row.
async function createSeedUser({ email, fullName, role, phone }) {
  const { data: existing } = await supabaseAdmin.auth.admin.listUsers();
  const already = existing.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  let userId;
  if (already) {
    userId = already.id;
    console.log(`  (reusing existing account) ${email}`);
  } else {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: SEED_PASSWORD,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone },
    });
    if (error) throw new Error(`createUser(${email}) failed: ${error.message}`);
    userId = data.user.id;
    console.log(`  created ${email}`);
  }

  if (role !== "talent") {
    const { error } = await supabaseAdmin.from("profiles").update({ role, status: "active" }).eq("id", userId);
    if (error) throw new Error(`profiles.update(${email}) failed: ${error.message}`);
  }

  return userId;
}

async function main() {
  console.log("Seeding talent profiles...");
  const talent1Id = await createSeedUser({
    email: "seed.talent1@example.com",
    fullName: "Amara Deng",
    role: "talent",
    phone: "+211900000001",
  });
  const talent2Id = await createSeedUser({
    email: "seed.talent2@example.com",
    fullName: "Peter Lual",
    role: "talent",
    phone: "+211900000002",
  });

  const { error: talent1Error } = await supabaseAdmin.from("talent_profiles").upsert({
    id: talent1Id,
    headline: "Graphic designer & brand illustrator",
    bio: "Five years designing brand identities for regional NGOs and small businesses.",
    category: "creative_media",
    skills: ["graphic design", "branding", "illustration"],
    languages: ["English", "Arabic"],
    location: "Juba",
    work_mode: "remote",
    years_experience: 5,
    verification_tier: "adorverified",
    public_visible: true,
  });
  if (talent1Error) throw new Error(`talent_profiles upsert (talent1) failed: ${talent1Error.message}`);

  const { error: talent2Error } = await supabaseAdmin.from("talent_profiles").upsert({
    id: talent2Id,
    headline: "Full-stack web developer",
    bio: "Builds and maintains web applications for local organisations.",
    category: "digital_technology",
    skills: ["javascript", "react", "node.js"],
    languages: ["English", "Swahili"],
    location: "Juba",
    work_mode: "hybrid",
    years_experience: 3,
    verification_tier: "registered",
    public_visible: false,
  });
  if (talent2Error) throw new Error(`talent_profiles upsert (talent2) failed: ${talent2Error.message}`);

  console.log("Seeding employer + organisation...");
  const employerId = await createSeedUser({
    email: "seed.employer1@example.com",
    fullName: "Grace Ajak",
    role: "individual_client",
    phone: "+211900000003",
  });

  const { data: org, error: orgError } = await supabaseAdmin
    .from("organisations")
    .upsert(
      {
        name: "Nile Youth Foundation",
        sector: "Non-profit / education",
        representative_id: employerId,
        verification_status: "verified",
      },
      { onConflict: "representative_id" }
    )
    .select()
    .single();
  if (orgError) throw new Error(`organisations upsert failed: ${orgError.message}`);

  console.log("Seeding opportunities...");
  const { error: opp1Error } = await supabaseAdmin.from("opportunities").insert({
    organisation_id: org.id,
    type: "project",
    title: "Design a new brand identity for our youth programme",
    brief: "Logo, colour palette and one-page brand guide for a new youth mentorship programme.",
    category: "creative_media",
    skills: ["graphic design", "branding"],
    engagement_type: "freelance",
    payment_basis: "fixed",
    location: "Juba",
    work_mode: "remote",
    budget_min: 500,
    budget_max: 1200,
    currency: "SSP",
    visibility: "public",
    status: "open",
    created_by: employerId,
    approved_by: employerId,
    approved_at: new Date().toISOString(),
  });
  if (opp1Error) throw new Error(`opportunities insert (design) failed: ${opp1Error.message}`);

  const { error: opp2Error } = await supabaseAdmin.from("opportunities").insert({
    organisation_id: org.id,
    type: "contract",
    title: "Maintain and update our programme website",
    brief: "Ongoing monthly maintenance and small feature additions to an existing website.",
    category: "digital_technology",
    skills: ["javascript", "react"],
    engagement_type: "fixed_term_contract",
    payment_basis: "monthly",
    location: "Juba",
    work_mode: "hybrid",
    budget_min: 800,
    budget_max: 800,
    currency: "SSP",
    visibility: "public",
    status: "pending_review",
    created_by: employerId,
  });
  if (opp2Error) throw new Error(`opportunities insert (website) failed: ${opp2Error.message}`);

  console.log("\nDone. Seeded 2 talent profiles, 1 employer/organisation, 2 opportunities (one open, one pending review).");
  console.log("Applications, offers and contracts are not seeded yet — a reasonable next increment once this is verified working.");
}

main().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
