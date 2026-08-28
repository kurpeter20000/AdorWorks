import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const talentServicesRouter = Router();
talentServicesRouter.use(requireAuth, requireStaff);

const STATUSES = ["draft", "pending_review", "published", "paused", "rejected", "removed"];

const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  talent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/talent-services — staff's review queue (defaults to no filter,
// staff console filters to pending_review for the queue view).
talentServicesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("talent_services")
      .select("*, talent_profiles(headline, verification_tier)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.talent_id) q = q.eq("talent_id", query.talent_id);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/talent-services/:id
talentServicesRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("talent_services")
      .select("*, talent_profiles(headline, verification_tier)")
      .eq("id", req.params.id)
      .single();
    if (error) throw new HttpError(404, "Service not found.");
    res.json({ data });
  })
);

// POST /api/talent-services/:id/publish — moves a reviewed service to
// 'published' so it appears on Browse Services. guard_talent_services_
// update() (0042) stamps published_at automatically.
talentServicesRouter.post(
  "/:id/publish",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("talent_services")
      .update({ status: "published", status_note: null, decided_by: req.user.id, decided_at: new Date().toISOString() })
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

// POST /api/talent-services/:id/reject — the talent can revise (moves
// back to draft) and resubmit themselves once they see the reason.
talentServicesRouter.post(
  "/:id/reject",
  asyncRoute(async (req, res) => {
    const { reason } = rejectSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("talent_services")
      .update({ status: "rejected", status_note: reason, decided_by: req.user.id, decided_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);

const pauseSchema = z.object({
  note: z.string().trim().max(2000).optional(),
});

// POST /api/talent-services/:id/pause — staff-side pause (talent can also
// pause their own published service themselves via the platform app).
talentServicesRouter.post(
  "/:id/pause",
  asyncRoute(async (req, res) => {
    const { note } = pauseSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("talent_services")
      .update({ status: "paused", status_note: note || null, decided_by: req.user.id, decided_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
