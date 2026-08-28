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

    if (body.status === "resolved" || body.status === "escalated") {
      const { data: contract } = data.contract_id
        ? await supabaseAdmin.from("contracts").select("talent_id, organisation_id").eq("id", data.contract_id).maybeSingle()
        : { data: null };
      const { data: org } = contract
        ? await supabaseAdmin.from("organisations").select("representative_id").eq("id", contract.organisation_id).maybeSingle()
        : { data: null };
      const recipients = [data.raised_by, contract?.talent_id, org?.representative_id].filter(
        (id, i, arr) => id && arr.indexOf(id) === i
      );
      if (recipients.length > 0) {
        await supabaseAdmin.from("notifications").insert(
          recipients.map((user_id) => ({
            user_id,
            type: body.status === "resolved" ? "dispute_resolved" : "dispute_escalated",
            title: body.status === "resolved" ? "A dispute on your contract was resolved" : "A dispute on your contract was escalated",
            body: body.resolution || null,
            link: data.contract_id ? `/contracts/${data.contract_id}` : null,
          }))
        );
      }
    }

    res.json({ data });
  })
);

const refundSchema = z.object({
  milestone_id: z.string().uuid(),
  notes: z.string().max(2000).optional(),
});

// POST /api/disputes/:id/refund — Stage 7: dispute-to-payment
// reconciliation, which didn't exist at all before (disputes only ever
// had a status + free-text resolution, with no code path touching
// payment_events/finance_records). Marks the milestone's settled payment
// refunded and records a finance_records 'refund' entry — the milestone
// itself stays 'paid' (delivery/payment history is a separate concern
// from this financial correction; no milestone_status value for
// "refunded" exists, by design, see 0026's own comments).
disputesRouter.post(
  "/:id/refund",
  asyncRoute(async (req, res) => {
    const { milestone_id, notes } = refundSchema.parse(req.body);

    const { data: dispute } = await supabaseAdmin.from("disputes").select("contract_id").eq("id", req.params.id).maybeSingle();
    if (!dispute || !dispute.contract_id) throw new HttpError(404, "Dispute not found or not contract-scoped.");

    const { data: payment } = await supabaseAdmin
      .from("payment_events")
      .select("id, amount, currency, status")
      .eq("milestone_id", milestone_id)
      .eq("contract_id", dispute.contract_id)
      .eq("status", "succeeded")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!payment) throw new HttpError(404, "No settled payment found for this milestone on this contract.");

    const { error: paymentError } = await supabaseAdmin
      .from("payment_events")
      .update({ status: "refunded" })
      .eq("id", payment.id);
    if (paymentError) throw new HttpError(500, paymentError.message);

    const { data: record, error: recordError } = await supabaseAdmin
      .from("finance_records")
      .insert({
        contract_id: dispute.contract_id,
        milestone_id,
        record_type: "refund",
        amount: payment.amount,
        currency: payment.currency,
        status: "confirmed",
        notes: notes || `Refund following dispute ${req.params.id}`,
        recorded_by: req.user.id,
      })
      .select()
      .single();
    if (recordError) throw new HttpError(500, recordError.message);

    res.json({ data: record });
  })
);
