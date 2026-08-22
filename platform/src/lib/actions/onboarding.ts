"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const BasicsSchema = z.object({
  honorific: z.string().optional(),
  legalName: z.string().trim().min(2, "Enter your legal name."),
  displayName: z.string().trim().min(2, "Enter a display name."),
  headline: z.string().trim().min(5, "Enter a short professional headline."),
  bio: z.string().trim().max(2000).optional(),
  location: z.string().trim().min(2, "Enter your location."),
  category: z.enum(["creative_media", "digital_technology", "business_project_support"], {
    message: "Choose a category.",
  }),
  skills: z.string().trim().min(1, "List at least one skill."),
  languages: z.string().trim().optional(),
  workMode: z.enum(["remote", "on_site", "hybrid", "any"]),
  availability: z.string().trim().optional(),
});

function splitList(value: string | undefined) {
  if (!value) return [];
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Onboarding step: basics (spec steps 3-6, condensed for the Phase 1 slice — see platform/README.md). */
export async function saveBasics(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("talent");

  const validated = BasicsSchema.safeParse({
    honorific: formData.get("honorific") || undefined,
    legalName: formData.get("legalName"),
    displayName: formData.get("displayName"),
    headline: formData.get("headline"),
    bio: formData.get("bio") || undefined,
    location: formData.get("location"),
    category: formData.get("category"),
    skills: formData.get("skills"),
    languages: formData.get("languages") || undefined,
    workMode: formData.get("workMode"),
    availability: formData.get("availability") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { error } = await supabase.from("talent_profiles").upsert({
    id: session.userId,
    honorific: v.honorific || null,
    legal_name: v.legalName,
    display_name: v.displayName,
    headline: v.headline,
    bio: v.bio || null,
    location: v.location,
    category: v.category,
    skills: splitList(v.skills),
    languages: splitList(v.languages),
    work_mode: v.workMode,
    availability: v.availability || null,
  });

  if (error) {
    return { message: `Could not save your profile: ${error.message}` };
  }

  redirect("/onboarding/verification");
}

/**
 * Records that identity-verification evidence was submitted (the file
 * itself is uploaded client-side straight to Supabase Storage — see
 * onboarding/verification/verification-form.tsx — because Server
 * Actions aren't the natural fit for large file uploads and RLS
 * already allows a talent to insert their own evidence row directly,
 * same as it always has). This action just confirms the step and
 * moves the wizard forward.
 */
export async function completeVerificationStep(): Promise<void> {
  await requireRole("talent");
  redirect("/onboarding/review");
}

const ReviewSchema = z.object({
  confirmed: z.literal("on", { message: "Confirm the declaration to continue." }),
});

/**
 * Step 10: profile preview + publication consent. This records the
 * user's own consent (their own profiles row — allowed) but
 * deliberately does NOT flip talent_profiles.public_visible — that
 * stays staff-controlled after verification (migration 0008's
 * guard_talent_profiles_update trigger blocks a user from setting it
 * themselves, on purpose). "I consent to be considered" and "AdorWorks
 * has verified and published me" are different facts.
 */
export async function confirmPublicationConsent(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("talent");
  const validated = ReviewSchema.safeParse({ confirmed: formData.get("confirmed") });
  if (!validated.success) {
    return { message: "Please confirm the declaration before continuing." };
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ consent_terms_at: new Date().toISOString() })
    .eq("id", session.userId);
  if (error) {
    return { message: `Could not record your confirmation: ${error.message}` };
  }

  redirect("/dashboard?onboarding=submitted");
}
