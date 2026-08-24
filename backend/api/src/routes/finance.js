import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireFinanceStaff } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

export const financeRouter = Router();
// Manual tracking only (no payment gateway is called anywhere in this
// file) — records what was agreed/invoiced/paid outside the platform,
// per the blueprint's compliance-first rule pending a licensed local
// payment partner. Finance-role or admin only, stricter than the
// general staff gate other routes use.
financeRouter.use(requireAuth, requireFinanceStaff);

const listQuerySchema = z.object({
  engagement_id: z.string().uuid().optional(),
  contract_id: z.string().uuid().optional(),
  status: z.enum(["pending", "confirmed", "reconciled", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/finance
financeRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("finance_records")
      .select(
        "*, engagements(organisation_id, talent_id, organisations(name), talent_profiles(headline)), " +
          "contracts(opportunities(title), organisations(name), talent_profiles(headline))",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.engagement_id) q = q.eq("engagement_id", query.engagement_id);
    if (query.contract_id) q = q.eq("contract_id", query.contract_id);
    if (query.status) q = q.eq("status", query.status);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const createSchema = z.object({
  engagement_id: z.string().uuid(),
  record_type: z.enum(["deposit", "invoice", "fee", "payout", "refund"]),
  amount: z.number(),
  currency: z.string().max(10).default("SSP"),
  exchange_rate_basis: z.string().max(200).optional(),
  notes: z.string().max(2000).optional(),
});

// POST /api/finance — record a deposit/invoice/fee/payout/refund.
financeRouter.post(
  "/",
  asyncRoute(async (req, res) => {
    const body = createSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("finance_records")
      .insert({ ...body, recorded_by: req.user.id })
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.status(201).json({ data });
  })
);

const updateSchema = z.object({
  status: z.enum(["pending", "confirmed", "reconciled", "cancelled"]).optional(),
  notes: z.string().max(2000).optional(),
});

// PATCH /api/finance/:id
financeRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const body = updateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("finance_records")
      .update(body)
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
