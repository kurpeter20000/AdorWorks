import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";
import { normalizeCategory, normalizeOpportunityType, splitList } from "../lookups.js";
import { logAuditEvent } from "../audit.js";

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
 * email — nobody is notified, and the account has no password until
 * someone sets one via the ordinary "forgot password" flow.
 *
 * Still used for convert-employer: an org rep is usually already in
 * direct contact with staff (phone/email) about their brief, and once
 * they sign in they land on the Project Brief they came in with, so a
 * silent account plus staff following up directly is an acceptable
 * interim. convert-talent below no longer uses this — see
 * provisionTalentAccountWithInvite for why.
 */
async function provisionAccountSilently(email, metadata) {
  return supabaseAdmin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: metadata,
  });
}

/**
 * S16-01: a talent applicant approved via convert-talent used to get
 * provisionAccountSilently — a real account, but with no password and
 * nobody ever told them it existed. There was no way for them to
 * discover their application had been approved, let alone log in: the
 * account just sat there, waiting for someone who'd never be told to
 * look for it. inviteUserByEmail sends Supabase's own invite email (an
 * account-creation link, distinct from a magic-link sign-in) with a
 * session embedded as a URL hash fragment — clicking it authenticates
 * them immediately in the browser, same mechanism already proven for
 * password-reset/signup-confirmation links (see platform's
 * auth-callback-client.tsx). From there, resolveDefaultNextPath routes
 * a talent profile with no headline yet to /activate-account, where
 * they set the password Supabase's invite flow itself never asks for,
 * then continue into the existing onboarding wizard (evidence upload,
 * etc.) — so this one function call is what makes "approved but never
 * told" become "approved, notified by email, and walked through setting
 * up their account."
 *
 * redirectTo is best-effort — Supabase silently drops it if the exact
 * URL isn't in the project's Redirect URLs allowlist, per
 * auth-callback-client.tsx's own comment. resolveDefaultNextPath's
 * profile-state check is what actually guarantees the right landing
 * page either way, so this isn't relied on for correctness.
 */
async function provisionTalentAccountWithInvite(email, metadata) {
  const siteUrl = process.env.PLATFORM_SITE_URL;
  const redirectTo = siteUrl
    ? `${siteUrl.replace(/\/$/, "")}/auth/callback?next=${encodeURIComponent("/activate-account")}`
    : undefined;
  return supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    data: metadata,
    ...(redirectTo ? { redirectTo } : {}),
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
// Approves a talent_application submission: provisions a real Supabase
// Auth account AND emails the applicant an invite to activate it (see
// provisionTalentAccountWithInvite above), creates the matching
// talent_profiles row, and leaves a notification waiting for them once
// they do log in. Requires the submission to include an email — staff
// should collect one before converting if it's missing.
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

    const { data: created, error: createError } = await provisionTalentAccountWithInvite(email, {
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

    // S10-14 gap-check (2026-09-19): provisioning a real account on
    // someone's behalf is exactly the kind of sensitive staff action this
    // route file had zero audit trail for, at all.
    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.created",
      actorId: req.user.id,
      subjectId: talentId,
      entityType: "talent_profiles",
      entityId: talentId,
      metadata: { via: "intake_convert_talent", intake_submission_id: submission.id, email },
    });

    // S16-01: written directly from backend/api rather than through
    // platform's notifyUser() helper — same cross-codebase pattern
    // already used by introduction_video_reviewed (talent.js) and
    // organisation_verification_decided (see notifications.ts's own
    // comment on that type). The invite email is the notification that
    // actually reaches them right now, since they have no account to
    // sign into yet; this row is what's waiting inside the app the
    // moment they do — so the "you were approved" moment isn't only a
    // single email that could get missed or land in spam.
    await supabaseAdmin.from("notifications").insert({
      user_id: talentId,
      type: "talent_application_approved",
      title: "Your AdorWorks application has been approved",
      body: "Check your email for a link to activate your account, set a password and finish your profile.",
      link: "/onboarding",
    });

    res.json({ data: { talent_id: talentId, talent_profile: talentProfile } });
  })
);

// POST /api/intake/:id/convert-employer
// Provisions an account for the organisation's representative, creates
// the organisation (verification_status stays 'pending' — this does NOT
// verify them, see Blueprint §5.4), and drafts an opportunity from the
// brief. Inserted as 'draft', not 'pending_review' — a raw intake brief
// rarely has engagement_type/payment_basis/a budget, all of which 0043's
// guard_opportunities_insert now requires before anything can reach
// pending_review. The newly-provisioned representative finishes it via
// the ordinary Project Brief completion flow
// (/organisation/opportunities/[id]/edit) once they sign in.
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
        status: "draft",
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

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.created",
      actorId: req.user.id,
      subjectId: representativeId,
      entityType: "organisations",
      entityId: organisation.id,
      metadata: { via: "intake_convert_employer", intake_submission_id: submission.id, email },
    });

    res.json({ data: { organisation, opportunity } });
  })
);
