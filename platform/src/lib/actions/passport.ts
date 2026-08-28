"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const OptionalUrlSchema = z
  .string()
  .trim()
  .optional()
  .refine((v) => !v || /^https?:\/\/.+/i.test(v), { message: "Enter a full URL starting with http(s)://." });

const LinksSchema = z.object({
  linkedinUrl: OptionalUrlSchema,
  githubUrl: OptionalUrlSchema,
  websiteUrl: OptionalUrlSchema,
});

/** Passport page: professional/social links. Same upsert-on-id pattern as onboarding's saveBasics. */
export async function updateProfessionalLinks(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("talent");

  const validated = LinksSchema.safeParse({
    linkedinUrl: formData.get("linkedinUrl") || undefined,
    githubUrl: formData.get("githubUrl") || undefined,
    websiteUrl: formData.get("websiteUrl") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { error } = await supabase.from("talent_profiles").upsert({
    id: session.userId,
    linkedin_url: v.linkedinUrl || null,
    github_url: v.githubUrl || null,
    website_url: v.websiteUrl || null,
  });

  if (error) {
    return { message: `Could not save your links: ${error.message}` };
  }

  revalidatePath("/passport");
  return {};
}

/** Passport page: headshot upload. The file itself is uploaded client-side straight to the talent-avatars bucket (see avatar-upload.tsx) — this just records the resulting path. */
export async function setTalentAvatar(filePath: string): Promise<FormState> {
  const session = await requireRole("talent");

  const supabase = await createClient();
  const { error } = await supabase.from("talent_profiles").update({ avatar_path: filePath }).eq("id", session.userId);

  if (error) {
    return { message: `Could not save your photo: ${error.message}` };
  }

  revalidatePath("/passport");
  revalidatePath(`/passport/${session.userId}`);
  return {};
}

/**
 * Free Trust & Safety orientation (0040/master doc §22). Deliberately not
 * gated behind any plan or fee — see the master document's own explicit
 * rule that essential safety learning must never be paywalled.
 */
export async function completeSafetyOrientation(): Promise<FormState> {
  const session = await requireRole("talent");

  const supabase = await createClient();
  const { error } = await supabase
    .from("talent_profiles")
    .update({ safety_orientation_completed_at: new Date().toISOString() })
    .eq("id", session.userId);

  if (error) {
    return { message: `Could not save this: ${error.message}` };
  }

  revalidatePath("/trust-safety");
  revalidatePath("/dashboard");
  return {};
}
