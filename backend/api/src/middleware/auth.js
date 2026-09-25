import { supabaseAdmin } from "../supabaseAdmin.js";

const STAFF_ROLES = new Set(["reviewer", "matcher", "finance", "admin"]);
const FINANCE_ROLES = new Set(["finance", "admin"]);

/**
 * S14-02 gap-check finding (2026-09-19): S04-08 requires every staff
 * role to enroll and verify TOTP MFA before reaching anything else, but
 * that gate (requireStaffMfa in platform/src/lib/dal/session.ts) only
 * ever ran in the Next.js app — this Express API trusted the JWT +
 * profile role alone. A staff account that had only completed password
 * login (aal1 — never enrolled MFA, or enrolled but hasn't verified
 * this session) still held a fully valid access token the platform app
 * itself would redirect to /mfa-setup or /mfa-challenge for, but that
 * token was accepted here without question.
 *
 * Supabase's access-token JWT carries the session's current assurance
 * level as an `aal` claim (`aal1` password-only, `aal2` MFA-verified
 * this session) — already cryptographically verified by
 * supabaseAdmin.auth.getUser(token) above, so decoding the token's own
 * payload here (not re-verifying the signature) is safe and avoids a
 * second network round trip.
 */
function decodeJwtPayload(token) {
  try {
    const payload = token.split(".")[1];
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

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

  // S14-02 — every staff role must have completed MFA for THIS session
  // before reaching any staff-only route, same requirement the
  // platform app already enforces. A non-staff caller's token is never
  // checked for this, matching S04-08's own scope (staff roles only).
  if (STAFF_ROLES.has(profile.role)) {
    const claims = decodeJwtPayload(token);
    if (!claims || claims.aal !== "aal2") {
      return res.status(403).json({
        error: "This account requires multi-factor authentication to be completed for this session before using staff tools.",
        code: "mfa_required",
      });
    }
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
