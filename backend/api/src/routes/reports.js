import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireStaff);

const TARGET_TYPES = ["opportunity", "talent_service", "talent_profile", "organisation"];
const STATUSES = ["open", "reviewed", "dismissed", "actioned"];

const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  target_type: z.enum(TARGET_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/reports — defaults to no filter; staff console filters to 'open' for the queue view.
reportsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("reports")
      .select("*, profiles(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.target_type) q = q.eq("target_type", query.target_type);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const updateSchema = z.object({
  status: z.enum(["reviewed", "dismissed", "actioned"]),
});

// PATCH /api/reports/:id — the only allowed status destinations from
// staff are reviewed/dismissed/actioned; a report can't be moved back to
// 'open' (that's only ever the initial insert value).
reportsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const { status } = updateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("reports")
      .update({ status, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
