import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const talentRouter = Router();
talentRouter.use(requireAuth, requireStaff);

const VERIFICATION_TIERS = [
  "registered",
  "identity_verified",
  "adorverified",
  "adorcertified",
  "team_lead",
];

const searchSchema = z.object({
  category: z.enum(["creative_media", "digital_technology", "business_project_support"]).optional(),
  tier: z.enum(VERIFICATION_TIERS).optional(),
  skill: z.string().optional(), // matches if this skill is in the talent's skills[]
  public_visible: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/talent — the shortlist-builder's search endpoint (Blueprint §5.5).
talentRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = searchSchema.parse(req.query);
    let q = supabaseAdmin
      .from("talent_profiles")
      .select("*, profiles!inner(full_name, phone, phone_verified, status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (query.category) q = q.eq("category", query.category);
    if (query.tier) q = q.eq("verification_tier", query.tier);
    if (query.skill) q = q.contains("skills", [query.skill]);
    if (query.public_visible !== undefined) q = q.eq("public_visible", query.public_visible);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/talent/:id — full detail including evidence + verification history.
talentRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { id } = req.params;
    const [profile, evidence, verificationHistory] = await Promise.all([
      supabaseAdmin
        .from("talent_profiles")
        .select("*, profiles!inner(full_name, phone, phone_verified, email_verified, status)")
        .eq("id", id)
        .single(),
      supabaseAdmin.from("talent_evidence").select("*").eq("talent_id", id).order("created_at", { ascending: false }),
      supabaseAdmin
        .from("verification_events")
        .select("*")
        .eq("talent_id", id)
        .order("created_at", { ascending: false }),
    ]);
    if (profile.error) throw new HttpError(404, "Talent profile not found.");
    res.json({
      data: {
        profile: profile.data,
        evidence: evidence.data || [],
        verification_history: verificationHistory.data || [],
      },
    });
  })
);

const updateSchema = z.object({
  headline: z.string().max(200).optional(),
  bio: z.string().max(4000).optional(),
  category: z.enum(["creative_media", "digital_technology", "business_project_support"]).optional(),
  skills: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  location: z.string().max(200).optional(),
  work_mode: z.enum(["remote", "on_site", "hybrid", "any"]).optional(),
  rate_min: z.number().nonnegative().optional(),
  rate_max: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  availability: z.string().max(200).optional(),
  years_experience: z.number().nonnegative().optional(),
  portfolio_url: z.string().url().optional(),
  readiness: z.record(z.any()).optional(),
  public_visible: z.boolean().optional(),
});

// PATCH /api/talent/:id — staff editing a profile on the person's behalf
// (e.g. tidying it up before setting public_visible = true).
talentRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("talent_profiles")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);

const verifySchema = z.object({
  new_tier: z.enum(VERIFICATION_TIERS),
  notes: z.string().max(2000).optional(),
});

// POST /api/talent/:id/verify — the audited path for changing someone's
// verification tier (Blueprint §5.2/§9.4: every tier change must record
// who changed it and when — direct RLS updates to talent_profiles don't
// write to verification_events, only this endpoint does).
talentRouter.post(
  "/:id/verify",
  asyncRoute(async (req, res) => {
    const { new_tier, notes } = verifySchema.parse(req.body);
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("talent_profiles")
      .select("verification_tier")
      .eq("id", req.params.id)
      .single();
    if (fetchError) throw new HttpError(404, "Talent profile not found.");

    const { error: updateError } = await supabaseAdmin
      .from("talent_profiles")
      .update({ verification_tier: new_tier })
      .eq("id", req.params.id);
    if (updateError) throw new HttpError(500, updateError.message);

    const { data: event, error: eventError } = await supabaseAdmin
      .from("verification_events")
      .insert({
        talent_id: req.params.id,
        old_tier: current.verification_tier,
        new_tier,
        reviewer_id: req.user.id,
        notes: notes || null,
      })
      .select()
      .single();
    if (eventError) throw new HttpError(500, eventError.message);

    res.json({ data: event });
  })
);

const evidenceReviewSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  notes: z.string().max(2000).optional(),
});

// POST /api/talent/:id/evidence/:evidenceId/review
talentRouter.post(
  "/:id/evidence/:evidenceId/review",
  asyncRoute(async (req, res) => {
    const { status, notes } = evidenceReviewSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("talent_evidence")
      .update({ status, notes, reviewer_id: req.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.params.evidenceId)
      .eq("talent_id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
