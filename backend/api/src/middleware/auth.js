import { supabaseAdmin } from "../supabaseAdmin.js";

const STAFF_ROLES = new Set(["reviewer", "matcher", "finance", "admin"]);
const FINANCE_ROLES = new Set(["finance", "admin"]);

/**
 * Verifies the Supabase-issued JWT in the Authorization header, then
 * loads that user's profile (for its `role`) using the service_role
 * client — this is the one place in the app that's allowed to look up
 * an arbitrary user's role, because it's checking the token holder's
 * OWN identity, not reading someone else's data.
 */
export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "Missing Authorization: Bearer <token> header." });
  }

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) {
    return res.status(401).json({ error: "Invalid or expired token." });
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, status, full_name")
    .eq("id", userData.user.id)
    .single();

  if (profileError || !profile) {
    return res.status(403).json({ error: "No profile found for this account." });
  }
  if (profile.status !== "active") {
    return res.status(403).json({ error: "This account is not active." });
  }

  req.user = {
    id: profile.id,
    role: profile.role,
    fullName: profile.full_name,
    email: userData.user.email,
  };
  next();
}

export function requireStaff(req, res, next) {
  if (!req.user || !STAFF_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: "Staff access required." });
  }
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== "admin") {
    return res.status(403).json({ error: "Admin access required." });
  }
  next();
}

export function requireFinanceStaff(req, res, next) {
  if (!req.user || !FINANCE_ROLES.has(req.user.role)) {
    return res.status(403).json({ error: "Finance or admin access required." });
  }
  next();
}
