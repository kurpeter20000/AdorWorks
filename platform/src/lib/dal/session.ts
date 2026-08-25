import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { UserRole } from "@/lib/database.types";

export interface VerifiedSession {
  userId: string;
  email: string | null;
  role: UserRole;
  fullName: string | null;
  status: "active" | "suspended" | "deleted";
  phone: string | null;
  phoneVerified: boolean;
}

/**
 * The Data Access Layer's core check, per the Next.js authentication
 * guide: centralizes "is there a real, active user" so every data
 * request / Server Action / Route Handler calls this instead of
 * re-implementing the check. Wrapped in React's cache() so multiple
 * calls during one render pass hit Supabase once, not N times.
 *
 * Returns null rather than redirecting — callers decide whether "not
 * signed in" means redirect-to-login (a page) or 401 (an API route).
 */
export const verifySession = cache(async (): Promise<VerifiedSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, full_name, status, phone, phone_verified")
    .eq("id", user.id)
    .single();
  if (!profile) return null;

  return {
    userId: user.id,
    email: user.email ?? null,
    role: profile.role,
    fullName: profile.full_name,
    status: profile.status,
    phone: profile.phone,
    phoneVerified: profile.phone_verified,
  };
});

/** For pages that require any signed-in, active account. Redirects to /login if not. */
export async function requireSession(): Promise<VerifiedSession> {
  const session = await verifySession();
  if (!session || session.status !== "active") {
    redirect("/login");
  }
  return session;
}

/** For pages restricted to specific roles (e.g. staff-only admin queues). Redirects to /dashboard if the role doesn't match — never silently renders nothing (see the auth guide's warning against that SPA pattern). */
export async function requireRole(...roles: UserRole[]): Promise<VerifiedSession> {
  const session = await requireSession();
  if (!roles.includes(session.role)) {
    redirect("/dashboard?error=forbidden");
  }
  return session;
}

export const STAFF_ROLES: UserRole[] = ["reviewer", "matcher", "finance", "admin"];

// The organisation/employer side, across both onboarding paths: the
// self-service signup flow assigns 'individual_client' (auth.ts), but the
// staff-assisted intake conversion flow (backend/api's
// POST /intake/:id/convert-employer) still assigns the older 'employer'
// role to the representative it provisions — both are the same real-world
// party and need the same access everywhere an org rep can act.
export const CLIENT_ROLES: UserRole[] = ["individual_client", "employer", "org_member", "org_admin"];
