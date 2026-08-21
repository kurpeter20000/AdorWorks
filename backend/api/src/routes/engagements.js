import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const engagementsRouter = Router();
engagementsRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  status: z.enum(["proposed", "contracted", "active", "completed", "cancelled", "disputed"]).optional(),
  organisation_id: z.string().uuid().optional(),
  talent_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/engagements
engagementsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("engagements")
      .select("*, organisations(name), talent_profiles(headline)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.organisation_id) q = q.eq("organisation_id", query.organisation_id);
    if (query.talent_id) q = q.eq("talent_id", query.talent_id);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/engagements/:id — includes the full audit trail.
engagementsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const [engagement, events, financeRecords, reviews, disputes] = await Promise.all([
      supabaseAdmin
        .from("engagements")
        .select("*, organisations(name), talent_profiles(headline), opportunities(title, type)")
        .eq("id", req.params.id)
        .single(),
      supabaseAdmin
        .from("engagement_events")
        .select("*")
        .eq("engagement_id", req.params.id)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("finance_records").select("*").eq("engagement_id", req.params.id),
      supabaseAdmin.from("reviews").select("*").eq("engagement_id", req.params.id),
      supabaseAdmin.from("disputes").select("*").eq("engagement_id", req.params.id),
    ]);
    if (engagement.error) throw new HttpError(404, "Engagement not found.");
    res.json({
      data: {
        engagement: engagement.data,
        events: events.data || [],
        finance_records: financeRecords.data || [],
        reviews: reviews.data || [],
        disputes: disputes.data || [],
      },
    });
  })
);

const createSchema = z.object({
  opportunity_id: z.string().uuid(),
  application_id: z.string().uuid().optional(),
  talent_id: z.string().uuid(),
  organisation_id: z.string().uuid(),
  contract_type: z.string().max(100).optional(),
  scope: z.string().max(8000).optional(),
  milestones: z.array(z.record(z.any())).optional(),
});

// POST /api/engagements — formalise an accepted application into a
// tracked engagement, with the creating staff member as the initial
// account owner (Blueprint §6.7: "one accountable owner").
engagementsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("engagements")
      .insert({ ...body, account_owner_id: req.user.id })
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    await supabaseAdmin.from("engagement_events").insert({
      engagement_id: data.id,
      event_type: "stage_change",
      old_value: null,
      new_value: data.status,
      actor_id: req.user.id,
    });

    res.status(201).json({ data });
  })
);

const updateSchema = z.object({
  status: z.enum(["proposed", "contracted", "active", "completed", "cancelled", "disputed"]).optional(),
  contract_type: z.string().max(100).optional(),
  scope: z.string().max(8000).optional(),
  milestones: z.array(z.record(z.any())).optional(),
  account_owner_id: z.string().uuid().optional(),
});

// PATCH /api/engagements/:id — every status or milestone change writes
// an engagement_events row with old/new value and who made the change.
engagementsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data: current, error: fetchError } = await supabaseAdmin
      .from("engagements")
      .select("status, milestones")
      .eq("id", req.params.id)
      .single();
    if (fetchError) throw new HttpError(404, "Engagement not found.");

    const patch = { ...body };
    if (body.status === "completed") patch.completed_at = new Date().toISOString();
    if (body.status === "active" && !current.started_at) patch.started_at = new Date().toISOString();

    const { data, error } = await supabaseAdmin
      .from("engagements")
      .update(patch)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    const events = [];
    if (body.status && body.status !== current.status) {
      events.push({
        engagement_id: req.params.id,
        event_type: "stage_change",
        old_value: current.status,
        new_value: body.status,
        actor_id: req.user.id,
      });
    }
    if (body.milestones) {
      events.push({
        engagement_id: req.params.id,
        event_type: "milestone_update",
        old_value: JSON.stringify(current.milestones),
        new_value: JSON.stringify(body.milestones),
        actor_id: req.user.id,
      });
    }
    if (events.length) await supabaseAdmin.from("engagement_events").insert(events);

    res.json({ data });
  })
);

const noteSchema = z.object({ note: z.string().min(1).max(4000) });

// POST /api/engagements/:id/notes — a free-text audit entry (e.g. a call summary).
engagementsRouter.post(
  "/:id/notes",
  asyncRoute(async (req, res) => {
    const { note } = noteSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("engagement_events")
      .insert({
        engagement_id: req.params.id,
        event_type: "note",
        new_value: note,
        actor_id: req.user.id,
      })
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.status(201).json({ data });
  })
);
