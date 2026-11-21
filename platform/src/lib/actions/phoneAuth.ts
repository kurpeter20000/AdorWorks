"use server";

import { z } from "zod";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { checkAndRecordAttempt, getClientIp } from "@/lib/domain/rateLimit";
import { RETURN_TO_COOKIE, resolveReturnPath } from "@/lib/domain/redirects";
import { normalisePhone } from "@/lib/domain/payoutMethods";
import { msg } from "@/i18n/config";
import type { FormState } from "./auth";

/**
 * Sign in or sign up with a phone number (0122; owner switched phone
 * sign-up on in Supabase). Supabase sends a 6-digit code by SMS through
 * the provider set in its dashboard (or accepts its test numbers), and
 * verifying it creates the session. Works without an email address —
 * Pathways participants enrol this way.
 *
 * Same policy-consent and intended-role rules as email sign-up: the role
 * travels in user metadata and the database trigger (0062) only accepts
 * the two non-privileged roles.
 */
const CURRENT_POLICY_VERSION = "1.0";

export interface PhoneCodeState extends FormState {
  sentTo?: string;
}

const SendSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("signin"), phone: z.string() }),
  z.object({
    mode: z.literal("signup"),
    phone: z.string(),
    fullName: z.string().trim().min(2, msg("Enter your full name.")).max(120),
    intent: z.enum(["talent", "hire"], { message: msg("Choose one.") }),
    policyConsent: z.literal("on", { message: msg("You must agree to the Terms of Use and Privacy Policy to continue.") }),
  }),
]);

export async function sendPhoneSignInCode(_prev: PhoneCodeState, formData: FormData): Promise<PhoneCodeState> {
  const parsed = SendSchema.safeParse({
    mode: formData.get("mode"),
    phone: formData.get("phone") ?? "",
    fullName: formData.get("fullName") ?? undefined,
    intent: formData.get("intent") ?? undefined,
    policyConsent: formData.get("policyConsent") ?? undefined,
  });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const phone = normalisePhone(parsed.data.phone);
  if (!phone) return { errors: { phone: [msg("Enter a valid phone number, e.g. 0912 345 678 or +211 912 345 678.")] } };

  const admin = createAdminClient();
  const [byPhone, byIp] = await Promise.all([
    checkAndRecordAttempt(admin, "phone_otp", phone),
    checkAndRecordAttempt(admin, "phone_otp", await getClientIp()),
  ]);
  if (!byPhone.allowed || !byIp.allowed) return { message: msg("Too many codes requested. Please wait an hour and try again.") };

  const returnTo = resolveReturnPath(formData.get("next") as string | null);
  if (returnTo && parsed.data.mode === "signup") {
    (await cookies()).set(RETURN_TO_COOKIE, returnTo, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 60 * 60 * 24 * 7 });
  }

  const supabase = await createClient();
  const { error } =
    parsed.data.mode === "signup"
      ? await supabase.auth.signInWithOtp({
          phone,
          options: {
            shouldCreateUser: true,
            data: {
              full_name: parsed.data.fullName,
              intended_role: parsed.data.intent === "talent" ? "talent" : "individual_client",
              policy_version: CURRENT_POLICY_VERSION,
            },
          },
        })
      : await supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } });

  if (error) {
    // Signing in with a number that has no account: say so plainly.
    if (parsed.data.mode === "signin" && /signups not allowed|not found|otp_disabled/i.test(error.message)) {
      return { message: msg("No account uses this phone number yet. Create an account with it instead.") };
    }
    console.error("[phone-auth] signInWithOtp failed:", error.message);
    return { message: msg("We couldn't send a code to that number. Check it and try again.") };
  }
  return { sentTo: phone };
}

const VerifySchema = z.object({
  phone: z.string(),
  token: z.string().trim().regex(/^\d{6}$/, msg("Enter the 6-digit code from the SMS.")),
});

export async function verifyPhoneSignInCode(_prev: PhoneCodeState, formData: FormData): Promise<PhoneCodeState> {
  const parsed = VerifySchema.safeParse({ phone: formData.get("phone") ?? "", token: formData.get("token") ?? "" });
  const phone = parsed.success ? normalisePhone(parsed.data.phone) : null;
  if (!parsed.success || !phone) {
    return { sentTo: phone ?? String(formData.get("phone") ?? ""), errors: parsed.success ? { token: [msg("Start again.")] } : parsed.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.verifyOtp({ phone, token: parsed.data.token, type: "sms" });
  if (error || !data.user) {
    return { sentTo: phone, errors: { token: [msg("That code is wrong or has expired. Check the SMS or ask for a new code.")] } };
  }

  // The code proved they hold this number.
  await createAdminClient().from("profiles").update({ phone, phone_verified: true }).eq("id", data.user.id);

  // New accounts start where email sign-up sends them: talent to onboarding,
  // employers to their organisation set-up (a saved return page is picked
  // up after onboarding, as with email sign-up).
  const isNew = formData.get("mode") === "signup";
  const next = isNew ? null : resolveReturnPath(formData.get("next") as string | null);
  redirect(next ?? (isNew ? (formData.get("intent") === "hire" ? "/organisation" : "/onboarding") : "/dashboard"));
}
