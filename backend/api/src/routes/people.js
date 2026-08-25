import { Router } from "express";
import { z } from "zod";
import { supabaseAdmin } from "../supabaseAdmin.js";
import { requireAuth, requireAdmin } from "../middleware/auth.js";
import { asyncRoute, HttpError } from "../asyncRoute.js";

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

const roleUpdateSchema = z.object({ role: z.enum(ROLES) });

// PATCH /api/people/:id/role — the sanctioned way to promote/demote an
// account instead of a manual SQL Editor update. Runs as service_role,
// which is what the 0008 self-escalation guard trigger requires for any
// non-staff-toggle role change.
peopleRouter.patch(
  "/:id/role",
  asyncRoute(async (req, res) => {
    const { role } = roleUpdateSchema.parse(req.body);
    const { data, error } = await supabaseAdmin
      .from("profiles")
      .update({ role })
      .eq("id", req.params.id)
      .select("id, role, status, full_name, created_at")
      .single();
    if (error) throw new HttpError(400, error.message);
    res.json({ data });
  })
);
