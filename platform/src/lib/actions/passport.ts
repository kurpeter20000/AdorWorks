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
