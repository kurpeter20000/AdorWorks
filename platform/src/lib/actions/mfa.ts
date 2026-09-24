"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAndRecordAttempt } from "@/lib/domain/rateLimit";
import { requireSessionWithoutMfaGate } from "@/lib/dal/session";
import type { FormState } from "./auth";

/**
 * S04-08 — staff accounts (reviewer/matcher/finance/admin) must enroll
 * and verify TOTP MFA before reaching anything else in the app. See
 * src/lib/dal/session.ts's requireStaffMfa() for where that's enforced;
 * these are the actions the /mfa-setup and /mfa-challenge pages call.
 */

/**
 * Called on /mfa-setup's initial render (a Server Component, not a form
 * submit) to get a fresh QR code + secret. Unenrolls any existing
 * unverified factor first — Supabase's enroll() only returns the QR/
 * secret at the moment of enrollment, not from listFactors() on a later
 * page load, so a stale half-finished enrollment would leave no way to
 * show a working QR code again without this.
 */
export type MfaEnrollmentResult =
  | { ok: true; factorId: string; qrCode: string; secret: string }
  | { ok: false; error: string };

export async function startMfaEnrollment(): Promise<MfaEnrollmentResult> {
  const supabase = await createClient();

  // listFactors()'s per-type arrays (.totp) only ever contain VERIFIED
  // factors by the API's own type contract — an unverified one only
  // shows up in .all, alongside verified ones of every type.
  const { data: factorsData, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) return { ok: false, error: listError.message };

  const stalePending = factorsData.all.find((f) => f.factor_type === "totp" && f.status === "unverified");
  if (stalePending) {
    await supabase.auth.mfa.unenroll({ factorId: stalePending.id });
  }

  const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp" });
  if (error) return { ok: false, error: error.message };

  return { ok: true, factorId: data.id, qrCode: data.totp.qr_code, secret: data.totp.secret };
}

const CodeSchema = z.object({
  factorId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from your authenticator app."),
});

/** Completes enrollment — the factor only becomes active once a real code from it is verified. */
export async function verifyMfaEnrollment(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = CodeSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  // Confirms a real, active session exists (redirects to /login otherwise)
  // without re-triggering the MFA gate itself — this page IS the gate.
  const session = await requireSessionWithoutMfaGate();

  // S14-05 gap-check finding — no limit existed on TOTP code attempts.
  // Lower severity here than verifyMfaChallenge (attacker would already
  // need to control the account mid-enrollment), but still worth the
  // same guard for consistency.
  const { allowed } = await checkAndRecordAttempt(createAdminClient(), "mfa_challenge", session.userId);
  if (!allowed) {
    return { message: "Too many attempts. Please wait a few minutes and try again." };
  }

  const supabase = await createClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: validated.data.factorId,
  });
  if (challengeError) return { message: challengeError.message };

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: validated.data.factorId,
    challengeId: challenge.id,
    code: validated.data.code,
  });
  if (verifyError) return { message: "That code didn't work — check your authenticator app and try again." };

  redirect("/dashboard");
}

/** For an already-enrolled staff member starting a new session — one code, no QR involved. */
export async function verifyMfaChallenge(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = CodeSchema.safeParse({
    factorId: formData.get("factorId"),
    code: formData.get("code"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const session = await requireSessionWithoutMfaGate();

  // S14-05 gap-check finding: a staff account with a stolen password but
  // no authenticator device could otherwise brute-force a 6-digit TOTP
  // code (1 in 1,000,000 per guess) with no limit at all — the most
  // severe of the confirmed rate-limiting gaps.
  const { allowed } = await checkAndRecordAttempt(createAdminClient(), "mfa_challenge", session.userId);
  if (!allowed) {
    return { message: "Too many attempts. Please wait a few minutes and try again." };
  }

  const supabase = await createClient();
  const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({
    factorId: validated.data.factorId,
  });
  if (challengeError) return { message: challengeError.message };

  const { error: verifyError } = await supabase.auth.mfa.verify({
    factorId: validated.data.factorId,
    challengeId: challenge.id,
    code: validated.data.code,
  });
  if (verifyError) return { message: "That code didn't work — check your authenticator app and try again." };

  redirect("/dashboard");
}

/** For the /mfa-challenge page to find which factor to challenge. */
export async function getVerifiedTotpFactorId(): Promise<string | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.mfa.listFactors();
  if (error) return null;
  // .totp is always verified-only by listFactors()'s own type contract.
  return data.totp[0]?.id ?? null;
}
