import { Router } from "express";
import { z } from "zod";
import { randomInt } from "crypto";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireStaff, requireAdmin } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

// A random, easy-to-read-aloud temporary password — for a brand-new
// account (an agent, or later an assisted person in Stage B) that a staff
// member relays verbally/in writing. Avoids visually ambiguous characters
// (0/O, 1/I/l) since it's meant to be read off a screen, not copy-pasted.
const READABLE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789";
export function generateTemporaryPassword(length = 10) {
  let out = "";
  for (let i = 0; i < length; i++) out += READABLE_CHARS[randomInt(READABLE_CHARS.length)];
  return out;
}

export const assistedOnboardingRouter = Router();
assistedOnboardingRouter.use(requireAuth, requireStaff);

// Fields an onboarding agent is ever allowed to touch on someone else's
// talent_profiles row, mirroring the platform's talent onboarding "basics"
// step (platform/src/lib/actions/onboarding.ts) minus nothing sensitive —
// legal_name is included since that's exactly the kind of field a
// low-literacy person would need help entering correctly. Kept as a
// server-side allowlist since RLS can't restrict by column name; the
// platform app's updateAssistedField Server Action re-checks against this
// same list (kept in sync manually — small, stable set).
export const ASSISTED_TALENT_FIELDS = [
  "legal_name",
  "display_name",
  "headline",
  "bio",
  "location",
  "category",
  "skills",
  "languages",
  "availability",
];

// ---------------------------------------------------------------------
// Partner hubs
// ---------------------------------------------------------------------

assistedOnboardingRouter.get(
  "/partner-hubs",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin.from("partner_hubs").select("*").order("name");
    if (error) throw new HttpError(500, error.message);
    res.json({ data });
  })
);

const partnerHubSchema = z.object({
  name: z.string().trim().min(2),
  contact_email: z.string().trim().email().optional().or(z.literal("")),
  contact_phone: z.string().trim().optional(),
  location: z.string().trim().optional(),
});

assistedOnboardingRouter.post(
  "/partner-hubs",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const body = partnerHubSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("partner_hubs")
      .insert({ ...body, contact_email: body.contact_email || null })
      .select()
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);

// ---------------------------------------------------------------------
// Onboarding agents
// ---------------------------------------------------------------------

assistedOnboardingRouter.get(
  "/onboarding-agents",
  asyncRoute(async (req, res) => {
    const { data, error } = await supabaseAdmin
      .from("onboarding_agents")
      .select("*, profiles!onboarding_agents_id_fkey(full_name, phone), partner_hubs(name)")
      .order("created_at", { ascending: false });
    if (error) throw new HttpError(500, error.message);
    res.json({ data });
  })
);

const createAgentSchema = z.object({
  email: z.string().trim().email(),
  full_name: z.string().trim().min(2).optional(),
  partner_hub_id: z.string().uuid(),
});

// POST /api/assisted-onboarding/onboarding-agents
// Finds an existing account by email, or provisions one silently (same
// pattern as intake.js's provisionAccountSilently — no invite email, since
// there's still no notification channel this codebase treats as reliable
// for a partner-hub volunteer). Either way, sets their role to
// 'onboarding_agent' (profiles.role is a single value, so this replaces
// whatever role they had — appropriate here since an agent is a distinct
// account type, not a talent/employer moonlighting) and links them to the
// given partner hub.
assistedOnboardingRouter.post(
  "/onboarding-agents",
  requireAdmin,
  asyncRoute(async (req, res) => {
    const body = createAgentSchema.parse(req.body);

    const { data: hub, error: hubError } = await supabaseAdmin
      .from("partner_hubs")
      .select("id")
      .eq("id", body.partner_hub_id)
      .maybeSingle();
    if (hubError) throw new HttpError(500, hubError.message);
    if (!hub) throw new HttpError(404, "Partner hub not found.");

    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new HttpError(500, listError.message);
    const existing = existingUsers.users.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());

    // Unlike intake.js's provisionAccountSilently (a stopgap written when
    // there was no dashboard for anyone to log into), an agent needs to
    // actually sign in to /assist — so a brand-new agent account gets a
    // real, one-time-visible temporary password, not a passwordless
    // email-confirm-only account. An existing account being promoted to
    // onboarding_agent keeps its own password untouched.
    let agentId;
    let temporaryPassword;
    if (existing) {
      agentId = existing.id;
    } else {
      temporaryPassword = generateTemporaryPassword();
      const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: body.email,
        password: temporaryPassword,
        email_confirm: true,
        user_metadata: { full_name: body.full_name || null },
      });
      if (createError) throw new HttpError(409, `Could not create an account: ${createError.message}`);
      agentId = created.user.id;
    }

    await supabaseAdmin.from("profiles").update({ role: "onboarding_agent" }).eq("id", agentId);

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("onboarding_agents")
      .upsert({ id: agentId, partner_hub_id: body.partner_hub_id, status: "active", created_by: req.user.id })
      .select()
      .single();
    if (agentError) throw new HttpError(400, agentError.message);

    res.json({ data: agent, temporary_password: temporaryPassword || null });
  })
);

// ---------------------------------------------------------------------
// Assistance requests
// ---------------------------------------------------------------------

const listRequestsSchema = z.object({
  status: z.enum(["pending", "assigned", "closed", "cancelled"]).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

assistedOnboardingRouter.get(
  "/assistance-requests",
  asyncRoute(async (req, res) => {
    const query = listRequestsSchema.parse(req.query);
    let q = supabaseAdmin
      .from("assistance_requests")
      .select("*, profiles(full_name, phone)", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(query.offset, query.offset + query.limit - 1);
    if (query.status) q = q.eq("status", query.status);

    const { data, error, count } = await q;
    if (error) throw new HttpError(500, error.message);
    res.json({ data, count });
  })
);

const startSessionSchema = z.object({
  agent_id: z.string().uuid(),
  fields: z.array(z.enum(ASSISTED_TALENT_FIELDS)).min(1),
  expires_in_minutes: z.coerce.number().int().min(5).max(240).default(60),
});

// POST /api/assisted-onboarding/assistance-requests/:id/start-session
// Stage A only: the request must already be linked to a real account
// (requested_by not null). Brand-new-signup provisioning is Stage B —
// this deliberately rejects that case for now rather than guessing at it.
assistedOnboardingRouter.post(
  "/assistance-requests/:id/start-session",
  asyncRoute(async (req, res) => {
    const body = startSessionSchema.parse(req.body);

    const { data: request, error: requestError } = await supabaseAdmin
      .from("assistance_requests")
      .select("*")
      .eq("id", req.params.id)
      .maybeSingle();
    if (requestError) throw new HttpError(500, requestError.message);
    if (!request) throw new HttpError(404, "Assistance request not found.");
    if (!request.requested_by) {
      throw new HttpError(
        422,
        "This request has no linked account yet — assisted signup for brand-new accounts isn't available yet."
      );
    }
    if (request.status === "closed" || request.status === "cancelled") {
      throw new HttpError(409, `This request is already ${request.status}.`);
    }

    const { data: agent, error: agentError } = await supabaseAdmin
      .from("onboarding_agents")
      .select("id, status")
      .eq("id", body.agent_id)
      .maybeSingle();
    if (agentError) throw new HttpError(500, agentError.message);
    if (!agent) throw new HttpError(404, "Onboarding agent not found.");
    if (agent.status !== "active") throw new HttpError(422, "This agent's account is suspended.");

    const { data: session, error: sessionError } = await supabaseAdmin
      .from("assistance_sessions")
      .insert({
        assistance_request_id: request.id,
        agent_id: agent.id,
        user_id: request.requested_by,
        scope: { fields: body.fields },
        expires_at: new Date(Date.now() + body.expires_in_minutes * 60 * 1000).toISOString(),
        status: "pending_consent",
      })
      .select()
      .single();
    if (sessionError) throw new HttpError(400, sessionError.message);

    await supabaseAdmin.from("assistance_requests").update({ status: "assigned" }).eq("id", request.id);

    res.json({ data: session });
  })
);
