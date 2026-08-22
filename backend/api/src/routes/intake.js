import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";
import { normalizeCategory, normalizeOpportunityType, splitList } from "../lookups.js";

export const intakeRouter = Router();
intakeRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  status: z.enum(["new", "in_review", "converted", "archived"]).optional(),
  form_type: z
    .enum([
      "talent_application",
      "employer_brief",
      "shortlist_request",
      "service_request",
      "general_contact",
      "insights_subscribe",
    ])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/intake?status=new&form_type=talent_application
intakeRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("intake_submissions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.form_type) q = q.eq("form_type", query.form_type);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/intake/:id
intakeRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("intake_submissions")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (error) throw new HttpError(404, "Submission not found.");
    res.json({ data });
  })
);

const updateSchema = z.object({
  status: z.enum(["new", "in_review", "converted", "archived"]).optional(),
});

// PATCH /api/intake/:id — triage a submission (mark in_review/archived).
// For "converted", use the convert-* endpoints below instead — they set
// converted_to_table/converted_to_id atomically with the real record.
intakeRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("intake_submissions")
      .update({ ...body, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);

/**
 * Creates a Supabase Auth account WITHOUT sending an invite/magic-link
 * email. There's no talent/employer-facing dashboard yet (deliberately —
 * see staff/README.md), so an invite email would land someone on a
 * login page with nowhere to go. This still creates a real account (so
 * the talent_profiles/organisations foreign key to auth.users works,
 * and so switching to self-service later needs no data migration), just
 * silently — nobody is notified. When a real dashboard exists, change
 * this back to `supabaseAdmin.auth.admin.inviteUserByEmail(email, { data })`.
 */
async function provisionAccountSilently(email, metadata) {
  return supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
}

async function loadSubmission(id, expectedType) {
  const { data, error } = await supabaseAdmin
    .from("intake_submissions")
    .select("*")
    .eq("id", id)
    .single();
  if (error || !data) throw new HttpError(404, "Submission not found.");
  if (data.form_type !== expectedType) {
    throw new HttpError(400, `Expected a ${expectedType} submission, got ${data.form_type}.`);
  }
  if (data.status === "converted") {
    throw new HttpError(409, "This submission has already been converted.");
  }
  return data;
}

// POST /api/intake/:id/convert-talent
// Provisions a real Supabase Auth account (silently — see
// provisionAccountSilently above) for a talent_application submission,
// then creates the matching
// talent_profiles row. Requires the submission to include an email —
// staff should collect one before converting if it's missing.
intakeRouter.post(
  "/:id/convert-talent",
  asyncRoute(async (req, res) => {
    const submission = await loadSubmission(req.params.id, "talent_application");
    const p = submission.payload || {};
    const email = p.email;
    if (!email) {
      throw new HttpError(
        422,
        "This submission has no email address — collect one from the applicant before converting, since it's how they'll access their account."
      );
    }

    const { data: created, error: createError } = await provisionAccountSilently(email, {
      full_name: p.name || null,
      phone: p.phone || null,
    });
    if (createError) {
      throw new HttpError(
        409,
        `Could not create an account for ${email}: ${createError.message}. If this person already has an account, link the submission manually instead.`
      );
    }
    const talentId = created.user.id;

    const { data: talentProfile, error: profileError } = await supabaseAdmin
      .from("talent_profiles")
      .insert({
        id: talentId,
        headline: p.title || null,
        category: normalizeCategory(p.category),
        skills: splitList(p.skills),
        languages: splitList(p.languages),
        location: p.location || null,
        availability: p.availability || null,
        years_experience: p.years_experience ? Number(p.years_experience) || null : null,
        portfolio_url: p.portfolio_link || null,
      })
      .select()
      .single();
    if (profileError) throw new HttpError(500, profileError.message);

    await supabaseAdmin
      .from("intake_submissions")
      .update({
        status: "converted",
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        converted_to_table: "talent_profiles",
        converted_to_id: talentId,
      })
      .eq("id", submission.id);

    res.json({ data: { talent_id: talentId, talent_profile: talentProfile } });
  })
);

// POST /api/intake/:id/convert-employer
// Provisions an account for the organisation's representative, creates
// the organisation (verification_status stays 'pending' — this does NOT
// verify them, see Blueprint §5.4), and drafts an opportunity from the
// brief for staff to review before it's approved/published.
intakeRouter.post(
  "/:id/convert-employer",
  asyncRoute(async (req, res) => {
    const submission = await loadSubmission(req.params.id, "employer_brief");
    const p = submission.payload || {};
    const email = p.email;
    if (!email) {
      throw new HttpError(422, "This submission has no email address — collect one before converting.");
    }

    const { data: created, error: createError } = await provisionAccountSilently(email, {
      full_name: p.representative_name || null,
      phone: p.phone || null,
    });
    if (createError) {
      throw new HttpError(
        409,
        `Could not create an account for ${email}: ${createError.message}. If this person already has an account, link the submission manually instead.`
      );
    }
    const representativeId = created.user.id;

    // The signup trigger defaults everyone to 'talent' — this person is
    // signing up as an employer representative, so correct that here.
    await supabaseAdmin.from("profiles").update({ role: "employer" }).eq("id", representativeId);

    const { data: organisation, error: orgError } = await supabaseAdmin
      .from("organisations")
      .insert({
        name: p.organisation || "(unnamed organisation)",
        sector: p.sector || null,
        representative_id: representativeId,
        billing_email: email,
      })
      .select()
      .single();
    if (orgError) throw new HttpError(500, orgError.message);

    const { data: opportunity, error: oppError } = await supabaseAdmin
      .from("opportunities")
      .insert({
        organisation_id: organisation.id,
        type: normalizeOpportunityType(p.hiring_mode),
        title: p.problem_outcome ? String(p.problem_outcome).slice(0, 120) : "Untitled brief",
        brief: p.problem_outcome || null,
        category: normalizeCategory(p.category),
        skills: splitList(p.skills_category),
        location: p.location_mode || null,
        currency: p.currency || "SSP",
        status: "pending_review",
        created_by: req.user.id,
      })
      .select()
      .single();
    if (oppError) throw new HttpError(500, oppError.message);

    await supabaseAdmin
      .from("intake_submissions")
      .update({
        status: "converted",
        reviewed_by: req.user.id,
        reviewed_at: new Date().toISOString(),
        converted_to_table: "organisations",
        converted_to_id: organisation.id,
      })
      .eq("id", submission.id);

    res.json({ data: { organisation, opportunity } });
  })
);
