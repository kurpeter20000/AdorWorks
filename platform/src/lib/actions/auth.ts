"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  errors?: Record<string, string[]>;
  message?: string;
}

const SignupSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name."),
  email: z.string().trim().email("Enter a valid email address."),
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .regex(/[a-zA-Z]/, "Include at least one letter.")
    .regex(/[0-9]/, "Include at least one number."),
  intent: z.enum(["talent", "hire"], { message: "Choose one." }),
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
  });

  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }

  const { fullName, email, password, intent } = validated.data;
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

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName, intended_role: targetRole },
      emailRedirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=${nextPath}`,
    },
  });

  if (error) {
    return { message: error.message };
  }
  if (!data.user) {
    return { message: "Something went wrong creating your account. Please try again." };
  }

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
