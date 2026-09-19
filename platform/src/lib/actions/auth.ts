"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { checkAndRecordAttempt, getClientIp } from "@/lib/domain/rateLimit";
import { sendEmailSafely } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";

export interface FormState {
  errors?: Record<string, string[]>;
  message?: string;
}

// S04-09 — bump this whenever terms.html/privacy.html's own "Version"
// line changes, so newly-recorded consent always reflects what was
// actually shown at signup, not a stale value.
const CURRENT_POLICY_VERSION = "1.0";

const SignupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
  intent: z.enum(["talent", "hire"], { message: "Choose one." }),
  policyConsent: z.literal("on", { message: "You must agree to the Terms of Use and Privacy Policy to continue." }),
});

/**
 * Self-service signup (spec: "Dual-path registration — self-service
 * path", steps 1-2). Creates the Supabase Auth account; the DB trigger
 * (handle_new_auth_user, migration 0003) creates the matching profiles
 * row automatically with the default role, then this action promotes
 * it to the right starting role.
 *
 * Copy says "verify your email address" deliberately — never "verify
 * your identity". Confirming an email confirms a contact channel, not
 * a person (spec's explicit distinction).
 */
export async function signup(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = SignupSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password"),
    intent: formData.get("intent"),
    policyConsent: formData.get("policyConsent"),
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { fullName, email, password, intent } = validated.data;

  // S04-05 — by IP, not email: the thing worth limiting here is one
  // source creating many accounts, not repeated attempts for one
  // specific email (Supabase's own signUp already rejects a
  // already-registered email regardless).
  const ip = await getClientIp();
  const { allowed } = await checkAndRecordAttempt(createAdminClient(), "signup", ip);
  if (!allowed) {
    return { message: "Too many signup attempts. Please try again later." };
  }

  const supabase = await createClient();

  // The intended role travels in signUp's user_metadata, not a
  // follow-up `profiles.update()` — this project requires email
  // confirmation, so signUp() does NOT establish a session immediately
  // (verified by testing against the live project, not assumed), and a
  // follow-up update as an unauthenticated request would silently
  // affect zero rows under RLS. The DB trigger (migration 0009) reads
  // this metadata at INSERT time instead, and whitelists it against
  // only the two non-privileged roles — the metadata itself is
  // client-settable, so trusting it blindly would be its own
  // privilege-escalation bug.
  const targetRole = intent === "talent" ? "talent" : "individual_client";
  const nextPath = intent === "talent" ? "/onboarding" : "/organisation";
  const safeNextPath = nextPath.startsWith("/") ? nextPath : "/dashboard";

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // S04-09 — policy_version travels the same way intended_role does
      // and for the same reason (no session yet to run a follow-up
      // update as this user); migration 0062's handle_new_auth_user
      // reads it at profiles-row-creation time. Reaching this line at
      // all already means the checkbox was checked (Zod rejects the
      // submission otherwise), so there's no separate "did they
      // consent" branch here — only which version they saw.
      data: { full_name: fullName, intended_role: targetRole, policy_version: CURRENT_POLICY_VERSION },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent(safeNextPath)}`,
    },
  });

  if (error) {
    return { message: error.message };
  }
  if (!data.user) {
    return { message: "Something went wrong creating your account. Please try again." };
  }

  // No dashboard gate ever required a verified phone -- the reminder now
  // lives here instead, waiting in Notifications from the first login,
  // rather than as an interruption on the dashboard itself.
  await notifyUser(createAdminClient(), {
    userId: data.user.id,
    type: NOTIFICATION_TYPES.PHONE_VERIFICATION_REMINDER,
    title: "Verify your phone number",
    body: "Add and verify a phone number so employers and AdorWorks can reach you about time-sensitive opportunities.",
    link: "/notifications",
    dedupeKey: data.user.id,
  });

  redirect("/check-email");
}

const LoginSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  password: z.string().min(1, "Enter your password."),
});

export async function login(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  // S04-05 — by email, not IP: the thing worth limiting here is
  // repeated guesses against one specific account.
  const normalizedEmail = validated.data.email.toLowerCase();
  const { allowed } = await checkAndRecordAttempt(createAdminClient(), "login", normalizedEmail);
  if (!allowed) {
    return { message: "Too many login attempts. Please wait a few minutes and try again." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(validated.data);
  if (error) {
    return { message: "Incorrect email or password." };
  }

  redirect("/dashboard");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

const ForgotPasswordSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
});

// Always redirects to the same "check your email" state on success or
// failure — confirming/denying an email exists here would let someone
// enumerate registered accounts.
export async function requestPasswordReset(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = ForgotPasswordSchema.safeParse({ email: formData.get("email") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  // S04-05 — by email. Doesn't weaken the enumeration-safety above: the
  // limit applies the same way regardless of whether the email is
  // actually registered, so hitting it reveals nothing either way.
  const normalizedEmail = validated.data.email.toLowerCase();
  const { allowed } = await checkAndRecordAttempt(createAdminClient(), "password_reset_request", normalizedEmail);
  if (!allowed) {
    return { message: "Too many reset requests for this email. Please wait a few minutes and try again." };
  }

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(validated.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${encodeURIComponent("/reset-password")}`,
  });

  redirect("/forgot-password?sent=1");
}

const ResetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
});

// Only reachable with a session — either a normal one, or the short-lived
// recovery session /auth/callback establishes from the emailed reset link.
export async function resetPassword(_prevState: FormState, formData: FormData): Promise<FormState> {
  const validated = ResetPasswordSchema.safeParse({ password: formData.get("password") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: validated.data.password });
  if (error) {
    return { message: error.message };
  }

  // S11-02: a changed password previously had zero notification of any
  // kind — a standard security practice missing entirely: the account
  // owner should always hear about this, specifically so they'd notice if
  // it wasn't them. bypassPreference: true — opting out of activity email
  // was never meant to silence a "did you do this?" security notice.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (user) {
    const admin = createAdminClient();
    await notifyUser(admin, {
      userId: user.id,
      type: NOTIFICATION_TYPES.PASSWORD_CHANGED,
      title: "Your password was changed",
      body: "If this wasn't you, contact AdorWorks support immediately.",
    });
    await sendEmailSafely(
      user.email ?? null,
      "Your AdorWorks password was changed",
      renderEmail({
        heading: "Your password was changed",
        paragraphs: ["Your AdorWorks account password was just changed. If this wasn't you, contact support immediately."],
      }),
      { admin, recipientUserId: user.id, bypassPreference: true }
    );
  }

  redirect("/dashboard");
}
