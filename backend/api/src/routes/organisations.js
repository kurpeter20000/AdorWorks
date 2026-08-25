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
      .select("*, profiles!organisations_representative_id_fkey(id, full_name, phone), opportunities(*)")
      .eq("id", req.params.id)
      .single();
    if (error) throw new HttpError(404, "Organisation not found.");

    // profiles has no email column — resolve it from Auth for the one
    // representative this detail view needs (see backend/supabase/README.md).
    if (data.profiles?.id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(data.profiles.id);
      data.profiles.email = authUser?.user?.email || null;
    }

    res.json({ data });
  })
);

function summarizeByStatus(rows, key) {
  const by_status = {};
  for (const row of rows) by_status[row[key]] = (by_status[row[key]] || 0) + 1;
  return { total: rows.length, by_status };
}

// GET /api/organisations/:id/engagement — how much this employer has
// actually used the platform (not just their verification paperwork):
// opportunities posted, applications received across all of them, offers
// sent, contracts, and when they last did any of it.
organisationsRouter.get(
  "/:id/engagement",
  asyncRoute(async (req, res) => {
    const orgId = req.params.id;

    const { data: opportunities, error: oppError } = await supabaseAdmin
      .from("opportunities")
      .select("id, status, created_at")
      .eq("organisation_id", orgId);
    if (oppError) throw new HttpError(500, oppError.message);

    const opportunityIds = opportunities.map((o) => o.id);
    const [applicationsRes, offersRes, contractsRes] = await Promise.all([
      opportunityIds.length > 0
        ? supabaseAdmin.from("applications").select("id", { count: "exact", head: true }).in("opportunity_id", opportunityIds)
        : { count: 0 },
      supabaseAdmin.from("offers").select("id, status, created_at").eq("organisation_id", orgId),
      supabaseAdmin.from("contracts").select("id, status, created_at").eq("organisation_id", orgId),
    ]);
    if (applicationsRes.error) throw new HttpError(500, applicationsRes.error.message);
    if (offersRes.error) throw new HttpError(500, offersRes.error.message);
    if (contractsRes.error) throw new HttpError(500, contractsRes.error.message);

    const offers = offersRes.data || [];
    const contracts = contractsRes.data || [];
    const lastActivityAt = [...opportunities, ...offers, ...contracts]
      .map((r) => r.created_at)
      .sort()
      .at(-1);

    res.json({
      data: {
        opportunities: summarizeByStatus(opportunities, "status"),
        applications_total: applicationsRes.count || 0,
        offers: summarizeByStatus(offers, "status"),
        contracts: summarizeByStatus(contracts, "status"),
        last_activity_at: lastActivityAt || null,
      },
    });
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
