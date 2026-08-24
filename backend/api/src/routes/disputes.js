import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const disputesRouter = Router();
disputesRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "escalated"]).optional(),
  engagement_id: z.string().uuid().optional(),
  contract_id: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/disputes — Blueprint §5.7 dispute process, steps 1-2 (pause + review).
disputesRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("disputes")
      .select(
        "*, engagements(organisations(name), talent_profiles(headline)), " +
          "contracts(opportunities(title), organisations(name), talent_profiles(headline))",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.engagement_id) q = q.eq("engagement_id", query.engagement_id);
    if (query.contract_id) q = q.eq("contract_id", query.contract_id);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const updateSchema = z.object({
  status: z.enum(["open", "investigating", "resolved", "escalated"]).optional(),
  resolution: z.string().max(4000).optional(),
});

// PATCH /api/disputes/:id — Blueprint §5.7 steps 3-5 (facilitated
// resolution, escalation, recording the outcome). For a contract-scoped
// dispute, resolving it also un-pauses the contract (contracts.status
// 'disputed' -> 'active') — raising a dispute is the only code path that
// sets 'disputed' (see platform/src/lib/actions/contracts.ts::raiseDispute),
// so resolving is the only code path that should clear it.
disputesRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const patch = { ...body };
    if (body.status === "resolved") {
      patch.resolved_by = req.user.id;
      patch.resolved_at = new Date().toISOString();
    }
    const { data, error } = await supabaseAdmin
      .from("disputes")
      .update(patch)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    if (body.status === "resolved" && data.contract_id) {
      await supabaseAdmin
        .from("contracts")
        .update({ status: "active" })
        .eq("id", data.contract_id)
        .eq("status", "disputed");
    }

    res.json({ data });
  })
);
