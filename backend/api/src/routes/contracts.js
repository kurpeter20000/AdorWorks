import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

// Read-only oversight for the self-service offer -> accept -> contract ->
// deliver -> pay -> review flow (platform/, not this API) — nothing in
// this app ever writes to contracts/milestones/deliverables/
// payment_events; every state transition there goes through the
// platform app's own Server Actions (see platform/src/lib/actions/
// contracts.ts). This exists so staff aren't otherwise completely blind
// to that flow — no dispute visibility, no quality/payment oversight —
// the way they would be without it.
export const contractsRouter = Router();
contractsRouter.use(requireAuth, requireStaff);

const listQuerySchema = z.object({
  status: z.enum(["active", "completed", "cancelled", "disputed"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/contracts
contractsRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("contracts")
      .select(
        "*, opportunities(title), organisations(name), talent_profiles(display_name, headline)",
        { count: "exact" }
      )
      .order("started_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

// GET /api/contracts/:id
contractsRouter.get(
  "/:id",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("contracts")
      .select(
        "*, opportunities(title), organisations(name), talent_profiles(display_name, headline), " +
          "milestones(*, deliverables(*)), payment_events(*), reviews(*), timesheets(*), disputes(*)"
      )
      .eq("id", req.params.id)
      .single();
    if (error) throw new HttpError(404, "Contract not found.");
    res.json({ data });
  })
);
