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

// Stage 2 maker-checker: promoting anyone TO one of these two roles needs
// a second, different admin's approval (0036/role_change_requests).
// Demoting away from them, or any other role change, stays single-step —
// scoped narrowly since only admin/finance carry real financial or
// account-security power, and the team is small enough that a blanket
// requirement would just stall routine work.
const MONITORED_ROLES = ["admin", "finance"];

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

    if (v.fullName) {
      await supabaseAdmin.from("profiles").update({ full_name: v.fullName }).eq("id", userId);
    }

    if (MONITORED_ROLES.includes(v.role)) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("id, role, status, full_name, created_at")
        .eq("id", userId)
        .single();
      const requestRow = await createRoleChangeRequest(req, userId, v.role, previousRole);
      return res.json({
        data: { ...profile, email: v.email },
        temporaryPassword,
        pendingApproval: true,
        roleRequestId: requestRow.id,
        message: `Account ready. Promoting to ${v.role} needs a second admin's approval — see Pending role approvals below.`,
      });
    }

    const { data: profile, error: updateError } = await supabaseAdmin
      .from("profiles")
      .update({ role: v.role })
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

/** Shared by both role-assignment routes for the two monitored roles. */
async function createRoleChangeRequest(req, targetUserId, requestedRole, previousRole) {
  const { data: requestRow, error: requestError } = await supabaseAdmin
    .from("role_change_requests")
    .insert({ target_user_id: targetUserId, requested_role: requestedRole, requested_by: req.user.id })
    .select("id")
    .single();
  if (requestError) throw new HttpError(400, requestError.message);

  await logAuditEvent(supabaseAdmin, {
    name: "identity.account.role_change_requested",
    actorId: req.user.id,
    subjectId: targetUserId,
    entityType: "role_change_requests",
    entityId: requestRow.id,
    before: previousRole !== null ? { role: previousRole } : null,
    after: { requested_role: requestedRole },
  });

  return requestRow;
}

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

    if (MONITORED_ROLES.includes(role)) {
      const requestRow = await createRoleChangeRequest(req, req.params.id, role, before?.role ?? null);
      return res.json({
        data: before ? { id: req.params.id, role: before.role } : null,
        pendingApproval: true,
        roleRequestId: requestRow.id,
        message: `Promoting to ${role} needs a second admin's approval — see Pending role approvals below.`,
      });
    }

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

// POST /api/people/:id/force-reauth — S04-12. There is no admin API to
// instantly revoke an already-issued access token (Supabase's are
// stateless JWTs, valid until they naturally expire regardless of
// anything an admin does — confirmed against Supabase's own docs
// before building this; supabase.auth.admin.signOut() takes a JWT, not
// a user ID, so it can't target someone else's session). What IS real:
// setting a fresh random password invalidates their refresh tokens, so
// once their current access token expires (≤1 hour) they can't
// silently renew it and must log in again. The generated password is
// never returned — the point is to end their access, not to hand the
// admin a way to sign in as them.
peopleRouter.post(
  "/:id/force-reauth",
  asyncRoute(async (req, res) => {
    const newPassword = generateTemporaryPassword(24);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, { password: newPassword });
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.sessions_revoked",
      actorId: req.user.id,
      subjectId: req.params.id,
      entityType: "profiles",
      entityId: req.params.id,
      metadata: { via: "staff_people_force_reauth" },
    });

    res.json({ message: "Done — this account's active sessions will end within an hour as their access token expires." });
  })
);

const suspendSchema = z.object({
  reason: z.string().trim().min(10, "Explain why — at least 10 characters."),
});

// POST /api/people/:id/suspend — S10-08. Requires a reason; also rotates
// the account's password (same mechanism as force-reauth below) so a
// suspension takes effect within the hour, not just on their next login
// attempt after their current access token would otherwise still work.
peopleRouter.post(
  "/:id/suspend",
  asyncRoute(async (req, res) => {
    const { reason } = suspendSchema.parse(req.body);
    if (req.params.id === req.user.id) {
      throw new HttpError(400, "You can't suspend your own account.");
    }

    const { data: before } = await supabaseAdmin.from("profiles").select("status").eq("id", req.params.id).maybeSingle();
    if (!before) throw new HttpError(404, "Account not found.");
    if (before.status === "suspended") throw new HttpError(409, "This account is already suspended.");
    if (before.status === "deleted") throw new HttpError(409, "This account has been deleted.");

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        status: "suspended",
        suspended_reason: reason,
        suspended_at: new Date().toISOString(),
        suspended_by: req.user.id,
        reinstated_at: null,
        reinstated_by: null,
      })
      .eq("id", req.params.id)
      .select("id, role, status, full_name, created_at")
      .single();
    if (error) throw new HttpError(400, error.message);

    const { error: passwordError } = await supabaseAdmin.auth.admin.updateUserById(req.params.id, {
      password: generateTemporaryPassword(24),
    });
    if (passwordError) {
      // The status flip above already blocks every page/Server Action —
      // log this but don't fail the whole request over the session-
      // termination half, which is defense in depth, not the primary control.
      console.error(`suspend: could not rotate password for ${req.params.id}: ${passwordError.message}`);
    }

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.suspended",
      actorId: req.user.id,
      subjectId: req.params.id,
      entityType: "profiles",
      entityId: req.params.id,
      reason,
      before: { status: before.status },
      after: { status: "suspended" },
    });

    res.json({ data });
  })
);

const reinstateSchema = z.object({
  reason: z.string().trim().min(10, "Explain why — at least 10 characters."),
});

// POST /api/people/:id/reinstate — the reverse of suspend. Only valid
// from 'suspended' — reinstating a 'deleted' account isn't the same
// decision and isn't offered here.
peopleRouter.post(
  "/:id/reinstate",
  asyncRoute(async (req, res) => {
    const { reason } = reinstateSchema.parse(req.body);

    const { data: before } = await supabaseAdmin.from("profiles").select("status").eq("id", req.params.id).maybeSingle();
    if (!before) throw new HttpError(404, "Account not found.");
    if (before.status !== "suspended") throw new HttpError(409, "This account isn't currently suspended.");

    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({
        status: "active",
        reinstated_at: new Date().toISOString(),
        reinstated_by: req.user.id,
      })
      .eq("id", req.params.id)
      .select("id, role, status, full_name, created_at")
      .single();
    if (error) throw new HttpError(400, error.message);

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.reinstated",
      actorId: req.user.id,
      subjectId: req.params.id,
      entityType: "profiles",
      entityId: req.params.id,
      reason,
      before: { status: "suspended" },
      after: { status: "active" },
    });

    res.json({ data });
  })
);

// GET /api/people/role-requests — pending admin/finance promotions
// awaiting a second admin's decision (0036).
peopleRouter.get(
  "/role-requests",
  asyncRoute(async (req, res) => {
    const { data: requests, error } = await supabaseAdmin
      .from("role_change_requests")
      .select("id, target_user_id, requested_role, requested_by, status, decided_by, decided_at, reason, created_at")
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) throw new HttpError(500, error.message);

    const profileIds = [...new Set(requests.flatMap((r) => [r.target_user_id, r.requested_by]))];
    const { data: profiles } =
      profileIds.length > 0
        ? await supabaseAdmin.from("profiles").select("id, full_name").in("id", profileIds)
        : { data: [] };
    const nameById = new Map((profiles || []).map((p) => [p.id, p.full_name]));

    const data = requests.map((r) => ({
      ...r,
      target_name: nameById.get(r.target_user_id) || r.target_user_id,
      requested_by_name: nameById.get(r.requested_by) || r.requested_by,
    }));

    res.json({ data });
  })
);

const decisionSchema = z.object({ reason: z.string().max(2000).optional() });

// POST /api/people/role-requests/:id/approve — must be a different admin
// than whoever proposed it. The actual role change only ever happens
// here, never at request time.
peopleRouter.post(
  "/role-requests/:id/approve",
  asyncRoute(async (req, res) => {
    const { reason } = decisionSchema.parse(req.body);
    const { data: request, error: fetchError } = await supabaseAdmin
      .from("role_change_requests")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (fetchError) throw new HttpError(404, "Request not found.");
    if (request.status !== "pending") throw new HttpError(409, "This request has already been decided.");
    if (request.requested_by === req.user.id) {
      throw new HttpError(403, "A different admin must approve this — you can't approve your own request.");
    }

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({ role: request.requested_role })
      .eq("id", request.target_user_id);
    if (profileError) throw new HttpError(400, profileError.message);

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from("role_change_requests")
      .update({ status: "approved", decided_by: req.user.id, decided_at: new Date().toISOString(), reason: reason || null })
      .eq("id", req.params.id)
      .select()
      .single();
    if (updateError) throw new HttpError(400, updateError.message);

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.role_change_decided",
      actorId: req.user.id,
      subjectId: request.target_user_id,
      entityType: "role_change_requests",
      entityId: req.params.id,
      reason: reason || null,
      before: { status: "pending" },
      after: { status: "approved", role: request.requested_role },
      metadata: { requested_by: request.requested_by },
    });

    res.json({ data: updatedRequest });
  })
);

// POST /api/people/role-requests/:id/reject — any admin, including the
// original requester (this is also how they'd cancel their own proposal;
// self-cancelling isn't a privilege-escalation risk, only self-approving is).
peopleRouter.post(
  "/role-requests/:id/reject",
  asyncRoute(async (req, res) => {
    const { reason } = decisionSchema.parse(req.body);
    const { data: request, error: fetchError } = await supabaseAdmin
      .from("role_change_requests")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (fetchError) throw new HttpError(404, "Request not found.");
    if (request.status !== "pending") throw new HttpError(409, "This request has already been decided.");

    const { data: updatedRequest, error: updateError } = await supabaseAdmin
      .from("role_change_requests")
      .update({ status: "rejected", decided_by: req.user.id, decided_at: new Date().toISOString(), reason: reason || null })
      .eq("id", req.params.id)
      .select()
      .single();
    if (updateError) throw new HttpError(400, updateError.message);

    await logAuditEvent(supabaseAdmin, {
      name: "identity.account.role_change_decided",
      actorId: req.user.id,
      subjectId: request.target_user_id,
      entityType: "role_change_requests",
      entityId: req.params.id,
      reason: reason || null,
      before: { status: "pending" },
      after: { status: "rejected" },
      metadata: { requested_by: request.requested_by },
    });

    res.json({ data: updatedRequest });
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
