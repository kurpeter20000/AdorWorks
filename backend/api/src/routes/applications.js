import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const applicationsRouter = Router();
applicationsRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  opportunity_id: z.string().uuid().optional(),
  talent_id: z.string().uuid().optional(),
  stage: z
    .enum(["submitted", "shortlisted", "interviewing", "offered", "accepted", "rejected", "withdrawn"])
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/applications?opportunity_id=... — the shortlist for a brief.
applicationsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("applications")
      .select("*, talent_profiles(headline, category, verification_tier, location)", { count: "exact" })
      .order("suitability_score", { ascending: false, nullsFirst: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.opportunity_id) q = q.eq("opportunity_id", query.opportunity_id);
    if (query.talent_id) q = q.eq("talent_id", query.talent_id);
    if (query.stage) q = q.eq("stage", query.stage);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const createSchema = z.object({
  opportunity_id: z.string().uuid(),
  talent_id: z.string().uuid(),
  suitability_score: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
});

// POST /api/applications — a matcher adding a candidate to an
// opportunity's shortlist (Blueprint §5.1 step 3: "recommend three to
// five suitable candidates"). Starts at stage "submitted"; use PATCH to
// move it to "shortlisted" once it's actually ready to show the employer
// — applications_select's RLS policy hides "submitted"-stage rows from
// the employer specifically so the raw candidate pool stays private.
applicationsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("applications")
      .insert({ ...body, source: "matched", created_by: req.user.id })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") {
        throw new HttpError(409, "This talent is already on this opportunity's shortlist.");
      }
      throw new HttpError(400, error.message);
    }
    res.status(201).json({ data });
  })
);

const updateSchema = z.object({
  stage: z
    .enum(["submitted", "shortlisted", "interviewing", "offered", "accepted", "rejected", "withdrawn"])
    .optional(),
  suitability_score: z.number().min(0).max(100).optional(),
  notes: z.string().max(2000).optional(),
  decision_reason: z.string().max(2000).optional(),
});

// PATCH /api/applications/:id
applicationsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("applications")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
