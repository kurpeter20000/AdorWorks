import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff } from "../middleware/auth.js";
import { requireStaffArea } from "../middleware/staffAccess.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";
import { logAuditEvent } from "../audit.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireStaff, requireStaffArea("reports"));

// Stage 6 gap-check (0056) widened reports.target_type at the DB layer
// to also allow 'talent_video'/'portfolio_item' — this list (used only
// to validate the optional ?target_type= filter below, not to gate
// creation) already matches that.
const TARGET_TYPES = ["opportunity", "talent_service", "talent_profile", "organisation", "talent_video", "portfolio_item", "vouch"];
const STATUSES = ["open", "reviewed", "dismissed", "actioned"];
const SEVERITIES = ["low", "medium", "high", "critical"];

const listQuerySchema = z.object({
  status: z.enum(STATUSES).optional(),
  target_type: z.enum(TARGET_TYPES).optional(),
  severity: z.enum(SEVERITIES).optional(),
  assigned_to: z.string().uuid().optional(),
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
      // reports has three FKs to profiles (reporter_id, reviewed_by,
      // assigned_to — the last added by S10-06 after this embed was
      // first written) — PostgREST can't guess which one "profiles(...)"
      // means once there's more than one, and 500s instead. Found live:
      // GET /api/reports failed on every real report row once there was
      // more than one such FK. Named explicitly, same pattern already
      // used in organisations.js/assistedOnboarding.js.
      .select("*, profiles!reports_reporter_id_fkey(full_name)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);
    if (query.target_type) q = q.eq("target_type", query.target_type);
    if (query.severity) q = q.eq("severity", query.severity);
    if (query.assigned_to) q = q.eq("assigned_to", query.assigned_to);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const assignSchema = z.object({
  assigned_to: z.string().uuid().nullable(),
});

// PATCH /api/reports/:id/assign — S10-06: reports had no owner at all;
// staff can now claim one, hand it to a specific colleague, or unassign
// it (null) without that counting as a status decision.
reportsRouter.patch(
  "/:id/assign",
  asyncRoute(async (req, res) => {
    const { assigned_to } = assignSchema.parse(req.body);
    const { data: before } = await supabaseAdmin.from("reports").select("assigned_to").eq("id", req.params.id).maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("reports")
      .update({ assigned_to })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "case.report.assigned",
      actorId: req.user.id,
      subjectId: null,
      entityType: "reports",
      entityId: req.params.id,
      before: before ? { assigned_to: before.assigned_to } : null,
      after: { assigned_to },
    });

    res.json({ data });
  })
);

const severitySchema = z.object({
  severity: z.enum(SEVERITIES),
});

// PATCH /api/reports/:id/severity — set independently of the status
// decision, since triage (how urgent is this) and resolution (what did
// we do) are different moments and often different people for a
// higher-severity report.
reportsRouter.patch(
  "/:id/severity",
  asyncRoute(async (req, res) => {
    const { severity } = severitySchema.parse(req.body);
    const { data: before } = await supabaseAdmin.from("reports").select("severity").eq("id", req.params.id).maybeSingle();

    const { data, error } = await supabaseAdmin.from("reports").update({ severity }).eq("id", req.params.id).select().single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "case.report.severity_set",
      actorId: req.user.id,
      subjectId: null,
      entityType: "reports",
      entityId: req.params.id,
      before: before ? { severity: before.severity } : null,
      after: { severity },
    });

    res.json({ data });
  })
);

const TARGET_WORDS = {
  opportunity: "an opportunity",
  talent_service: "a service",
  talent_profile: "a profile",
  organisation: "an organisation",
  introduction_video: "an introduction video",
};

export const REPORT_OUTCOME_NOTICE = {
  actioned: {
    title: "We acted on your report",
    body: (what) => `Thank you for reporting ${what}. We reviewed it and took action under our Community Standards.`,
  },
  reviewed: {
    title: "We reviewed your report",
    body: (what) => `Thank you for reporting ${what}. We reviewed it and are keeping an eye on it.`,
  },
  dismissed: {
    title: "We reviewed your report",
    body: (what) => `Thank you for reporting ${what}. We reviewed it and didn't find a breach of our Community Standards. Thank you for looking out for others.`,
  },
};

const updateSchema = z.object({
  status: z.enum(["reviewed", "dismissed", "actioned"]),
  // S10-06/S10-13/S10-14 gap-check (2026-09-19): this endpoint previously
  // had no reason/notes field at all and never wrote to audit_events —
  // the one moderation decision in this codebase with zero record of
  // what staff actually did or why beyond a bare status value.
  resolution_notes: z.string().trim().min(5, "Say what you did and why."),
});

// PATCH /api/reports/:id — the only allowed status destinations from
// staff are reviewed/dismissed/actioned; a report can't be moved back to
// 'open' (that's only ever the initial insert value).
reportsRouter.patch(
  "/:id",
  asyncRoute(async (req, res) => {
    const { status, resolution_notes } = updateSchema.parse(req.body);
    const { data: before } = await supabaseAdmin.from("reports").select("status").eq("id", req.params.id).maybeSingle();

    const { data, error } = await supabaseAdmin
      .from("reports")
      .update({ status, resolution_notes, reviewed_by: req.user.id, reviewed_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "case.report.resolved",
      actorId: req.user.id,
      subjectId: null,
      entityType: "reports",
      entityId: req.params.id,
      reason: resolution_notes,
      before: before ? { status: before.status } : null,
      after: { status },
      metadata: { target_type: data.target_type, target_id: data.target_id },
    });

    // Spec: "tell the reporter the outcome". Only the outcome — never
    // what happened to the other person or which staff member decided.
    // Best-effort: a failed notice never undoes the decision.
    const outcome = REPORT_OUTCOME_NOTICE[status];
    if (outcome && data.reporter_id) {
      const what = TARGET_WORDS[data.target_type] ?? "something on AdorWorks";
      const { error: noteError } = await supabaseAdmin.from("notifications").insert({
        user_id: data.reporter_id,
        type: "report_resolved",
        title: outcome.title,
        body: outcome.body(what),
        link: null,
      });
      if (noteError) console.error(`reports: could not notify reporter of ${req.params.id}: ${noteError.message}`);
    }

    res.json({ data });
  })
);
