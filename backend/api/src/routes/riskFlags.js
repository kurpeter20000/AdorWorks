import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";
import { logAuditEvent } from "../audit.js";

// S10-11: proactive fraud/scam indicators — separate from the reactive,
// user-submitted `reports` table (see 0083's own comment for why).
export const riskFlagsRouter = Router();
riskFlagsRouter.use(requireAuth, requireStaff);

const TARGET_TYPES = ["organisation", "opportunity", "talent_profile", "talent_service", "file"];
const INDICATORS = ["fraud", "scam", "fake_identity", "payment_risk", "other"];

const listQuerySchema = z.object({
  target_type: z.enum(TARGET_TYPES).optional(),
  target_id: z.string().optional(),
  resolved: z.coerce.boolean().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/risk-flags — defaults to no filter; pass target_type+target_id
// to check whether a specific organisation/opportunity/etc already has
// open flags before making a decision about it.
riskFlagsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("risk_flags")
      .select("*, flagger:flagged_by(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.target_type) q = q.eq("target_type", query.target_type);
    if (query.target_id) q = q.eq("target_id", query.target_id);
    if (query.resolved !== undefined) q = q.eq("resolved", query.resolved);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const createSchema = z.object({
  target_type: z.enum(TARGET_TYPES),
  target_id: z.string().trim().min(1),
  indicator: z.enum(INDICATORS),
  note: z.string().trim().min(5, "Say what's suspicious and why."),
});

// POST /api/risk-flags — any staff role can raise one (this is a low-
// friction "something looks off" signal, not a formal decision — no
// finance/admin gate needed the way an actual verification/suspension
// decision has).
riskFlagsRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("risk_flags")
      .insert({ ...body, flagged_by: req.user.id })
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "case.risk_flag.raised",
      actorId: req.user.id,
      subjectId: null,
      entityType: "risk_flags",
      entityId: data.id,
      reason: body.note,
      after: { target_type: body.target_type, target_id: body.target_id, indicator: body.indicator },
    });

    res.status(201).json({ data });
  })
);

const resolveSchema = z.object({
  resolution_notes: z.string().trim().min(5, "Say what you found and what you did."),
});

// POST /api/risk-flags/:id/resolve
riskFlagsRouter.post(
  "/:id/resolve",
  asyncRoute(async (req, res) => {
    const { resolution_notes } = resolveSchema.parse(req.body);
    const { data: before } = await supabaseAdmin.from("risk_flags").select("resolved").eq("id", req.params.id).maybeSingle();
    if (!before) throw new HttpError(404, "Flag not found.");
    if (before.resolved) throw new HttpError(409, "This flag is already resolved.");

    const { data, error } = await supabaseAdmin
      .from("risk_flags")
      .update({ resolved: true, resolved_by: req.user.id, resolved_at: new Date().toISOString(), resolution_notes })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "case.risk_flag.resolved",
      actorId: req.user.id,
      subjectId: null,
      entityType: "risk_flags",
      entityId: req.params.id,
      reason: resolution_notes,
      before: { resolved: false },
      after: { resolved: true },
    });

    res.json({ data });
  })
);
