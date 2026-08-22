import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const opportunitiesRouter = Router();
opportunitiesRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  status: z.enum(["draft", "pending_review", "open", "filled", "closed", "cancelled", "rejected"]).optional(),
  organisation_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/opportunities
opportunitiesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("opportunities")
      .select("*, organisations(name, verification_status)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.organisation_id) q = q.eq("organisation_id", query.organisation_id);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/opportunities/:id
opportunitiesRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("opportunities")
      .select("*, organisations(name, verification_status), applications(*, talent_profiles(headline, verification_tier))")
      .eq("id", req.params.id)
      .single();
    if (error) throw new HttpError(404, "Opportunity not found.");
    res.json({ data });
  })
);

const createSchema = z.object({
  organisation_id: z.string().uuid(),
  type: z.enum(["service", "project", "contract", "full_time", "squad"]),
  title: z.string().min(1).max(200),
  brief: z.string().max(8000).optional(),
  category: z.enum(["creative_media", "digital_technology", "business_project_support"]).optional(),
  skills: z.array(z.string()).optional(),
  location: z.string().max(200).optional(),
  work_mode: z.enum(["remote", "on_site", "hybrid", "any"]).optional(),
  budget_min: z.number().nonnegative().optional(),
  budget_max: z.number().nonnegative().optional(),
  currency: z.string().max(10).optional(),
  start_date: z.string().optional(),
  deadline: z.string().optional(),
  visibility: z.enum(["private", "public"]).optional(),
});

// POST /api/opportunities — staff creating/logging a brief directly
// (most will instead arrive via POST /api/intake/:id/convert-employer).
opportunitiesRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("opportunities")
      .insert({ ...body, status: "pending_review", created_by: req.user.id })
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.status(201).json({ data });
  })
);

const updateSchema = createSchema.partial().extend({
  status: z.enum(["draft", "pending_review", "open", "filled", "closed", "cancelled", "rejected"]).optional(),
});

// PATCH /api/opportunities/:id
opportunitiesRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("opportunities")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);

// POST /api/opportunities/:id/approve — moves a reviewed brief to "open"
// so it becomes matchable (and, if visibility=public, publicly listable).
opportunitiesRouter.post(
  "/:id/approve",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("opportunities")
      .update({ status: "open", approved_by: req.user.id, approved_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);

const rejectSchema = z.object({
  reason: z.string().trim().min(1, "A reason is required.").max(2000),
});

// POST /api/opportunities/:id/reject — the moderation counterpart to
// approve. Records why, same as organisations' verification rejection
// already does with risk_notes.
opportunitiesRouter.post(
  "/:id/reject",
  asyncRoute(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("opportunities")
      .update({ status: "rejected", rejection_reason: reason })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
