import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const reviewsRouter = Router();
reviewsRouter.use(requireAuth, requireStaff);

// Reviews are written directly by talent/employer participants via the
// Supabase client (RLS policy reviews_insert allows it) — this route is
// read-only, for the staff quality dashboard (Blueprint §9.2: completion,
// satisfaction, repeat-hire rate).

const listQuerySchema = z.object({
  engagement_id: z.string().uuid().optional(),
  reviewer_role: z.enum(["talent", "employer"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

reviewsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("reviews")
      .select("*, engagements(organisations(name), talent_profiles(headline))", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.engagement_id) q = q.eq("engagement_id", query.engagement_id);
    if (query.reviewer_role) q = q.eq("reviewer_role", query.reviewer_role);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);
