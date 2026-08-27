import { Router } from "express";
import { randomInt } from "crypto";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";
import { logAuditEvent } from "../audit.js";

export const peopleRouter = Router();
// Admin-only: this is a directory across every role (including other
// staff), which is more than a reviewer/matcher/finance account needs.
peopleRouter.use(requireAuth, requireAdmin);

const ROLES = [
  "talent",
  "individual_client",
  "employer",
  "org_member",
  "org_admin",
  "reviewer",
  "matcher",
  "finance",
  "admin",
  "onboarding_agent",
  "partner_hub_admin",
];

const listQuerySchema = z.object({
  role: z.enum(ROLES).optional(),
  status: z.enum(["active", "suspended", "deleted"]).optional(),
  q: z.string().optional(), // matches full_name
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// GET /api/people — search/filter across profiles by role/status/name.
peopleRouter.get(
  "/",
  asyncRoute(async (req, res) => {
    const query = listQuerySchema.parse(req.query);
    let q = supabaseAdmin
      .from("profiles")
      .select("id, role, status, full_name, phone, created_at", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);

    if (query.role) q = q.eq("role", query.role);
    if (query.status) q = q.eq("status", query.status);
    if (query.q) q = q.ilike("full_name", `%${query.q}%`);

    const { data: profiles, error, count } = await q;
    if (error) throw new HttpError(500, error.message);

    // profiles has no email column (see backend/supabase/README.md) — the
    // Admin API is the only way to resolve it, so batch-resolve just this page.
    const withEmail = await Promise.all(
      profiles.map(async (p) => {
        const { data } = await supabaseAdmin.auth.admin.getUserById(p.id);
        return { ...p, email: data?.user?.email || null };
      })
    );

    res.json({ data: withEmail, count });
  })
);

const STAFF_ROLES = ["reviewer", "matcher", "finance", "admin"];

// Same "easy to read aloud" alphabet as the platform app's org-team invite
// (organisationTeam.ts) — an admin relays this directly to the new hire,
// same reasoning: no reliable email-delivery channel for this yet.
const READABLE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
function generateTemporaryPassword(length = 10) {
  let out = "";
  for (let i = 0; i < length; i++) out += READABLE_CHARS[randomInt(READABLE_CHARS.length)];
  return out;
}

const addStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: z.string().trim().min(2).optional(),
  role: z.enum(STAFF_ROLES),
});

// POST /api/people/staff — creates (or promotes) a staff account in one
// step, replacing the Supabase dashboard "Add user" + SQL Editor round
// trip documented in backend/supabase/README.md. A brand-new account gets
// a real one-time temporary password returned once, never stored or
// logged — the admin relays it to the person directly.
peopleRouter.post(
  "/staff",
  asyncRoute(async (req, res) => {
    const v = addStaffSchema.parse(req.body);

    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new HttpError(500, listError.message);
    const existing = existingUsers.users.find((u) => u.email?.toLowerCase() === v.email);

    let userId;
    let temporaryPassword;
    let previousRole = null;
    if (existing) {
      userId = existing.id;
      const { data: existingProfile } = await supabaseAdmin.from("profiles").select("role").eq("id", userId).maybeSingle();
      previousRole = existingProfile?.role ?? null;
    } else {
      temporaryPassword = generateTemporaryPassword();
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: v.email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: v.fullName || null },
      });
      if (createError) throw new HttpError(400, `Could not create an account: ${createError.message}`);
      userId = created.user.id;
    }

    const updates = { role: v.role };
    if (v.fullName) updates.full_name = v.fullName;
    const { data: profile, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update(updates)
      .eq("id", userId)
      .select("id, role, status, full_name, created_at")
      .single();
    if (updateError) throw new HttpError(400, updateError.message);

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.role_assigned",
      actorId: req.user.id,
      subjectId: userId,
      entityType: "profiles",
      entityId: userId,
      before: previousRole !== null ? { role: previousRole } : null,
      after: { role: v.role },
      metadata: { via: "staff_people_add_staff" },
    });

    res.json({ data: { ...profile, email: v.email }, temporaryPassword });
  })
);

const roleUpdateSchema = z.object({ role: z.enum(ROLES) });

// PATCH /api/people/:id/role — the sanctioned way to promote/demote an
// account instead of a manual SQL Editor update. Runs as service_role,
// which is what the 0008 self-escalation guard trigger requires for any
// non-staff-toggle role change.
peopleRouter.patch(
  "/:id/role",
  asyncRoute(async (req, res) => {
    const { role } = roleUpdateSchema.parse(req.body);
    const { data: before } = await supabaseAdmin.from("profiles").select("role").eq("id", req.params.id).maybeSingle();
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ role })
      .eq("id", req.params.id)
      .select("id, role, status, full_name, created_at")
      .single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.role_assigned",
      actorId: req.user.id,
      subjectId: req.params.id,
      entityType: "profiles",
      entityId: req.params.id,
      before: before ? { role: before.role } : null,
      after: { role },
      metadata: { via: "staff_people_role_patch" },
    });

    res.json({ data });
  })
);

const auditQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// GET /api/people/audit-events — read-only foundation for an operations
// audit view (0035). Only what's written so far (staff role changes and
// organisation-invite role assignments) shows up here; this is a starting
// point, not a complete activity log.
peopleRouter.get(
  "/audit-events",
  asyncRoute(async (req, res) => {
    const { limit } = auditQuerySchema.parse(req.query);
    const { data: events, error } = await supabaseAdmin
      .from("audit_events")
      .select("id, name, occurred_at, actor_id, subject_id, entity_type, entity_id, reason, before, after, metadata")
      .order("occurred_at", { ascending: false })
      .limit(limit);
    if (error) throw new HttpError(500, error.message);

    const profileIds = [...new Set(events.flatMap((e) => [e.actor_id, e.subject_id]).filter(Boolean))];
    const { data: profiles } =
      profileIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", profileIds)
        : { data: [] };
    const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name]));

    const data = events.map((e) => ({
      ...e,
      actor_name: e.actor_id ? nameById.get(e.actor_id) || null : null,
      subject_name: e.subject_id ? nameById.get(e.subject_id) || null : null,
    }));

    res.json({ data });
  })
);
