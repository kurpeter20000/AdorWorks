import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const organisationsRouter = Router();
organisationsRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  verification_status: z.enum(["pending", "verified", "rejected", "suspended"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/organisations
organisationsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("organisations")
      .select("*, profiles!organisations_representative_id_fkey(full_name, phone)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.verification_status) q = q.eq("verification_status", query.verification_status);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/organisations/:id
organisationsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("organisations")
      .select("*, profiles!organisations_representative_id_fkey(full_name, phone), opportunities(*)")
      .eq("id", req.params.id)
      .single();
    if (error) throw new HttpError(404, "Organisation not found.");
    res.json({ data });
  })
);

const verifySchema = z.object({
  verification_status: z.enum(["pending", "verified", "rejected", "suspended"]),
  risk_notes: z.string().max(2000).optional(),
});

// PATCH /api/organisations/:id/verify — Blueprint §5.4 employer
// verification checklist is followed manually by staff off-platform
// (registration evidence, decision authority, etc.); this endpoint just
// records the outcome once that review is done.
organisationsRouter.patch(
  "/:id/verify",
  asyncRoute(async (req, res) => {
    const body = verifySchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("organisations")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
