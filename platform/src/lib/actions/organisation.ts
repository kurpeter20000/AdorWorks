"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

const OrganisationSchema = z.object({
  name: z.string().trim().min(2, "Enter your organisation or business name."),
  sector: z.string().trim().optional(),
  website: z.string().trim().optional(),
  billingEmail: z.string().trim().email("Enter a valid email address.").optional().or(z.literal("")),
});

/**
 * Employer counterpart to the talent onboarding wizard's "basics" step.
 * Creates the organisations row that every opportunity this employer
 * posts will hang off. representative_id = the signed-in user — RLS
 * (organisations_insert) requires that match, and 0010's
 * guard_organisations_insert trigger blocks setting verification_status
 * to anything but its 'pending' default here, so this can never
 * self-verify.
 */
export async function createOrganisation(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireRole("individual_client");

  const validated = OrganisationSchema.safeParse({
    name: formData.get("name"),
    sector: formData.get("sector") || undefined,
    website: formData.get("website") || undefined,
    billingEmail: formData.get("billingEmail") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { error } = await supabase.from("organisations").insert({
    name: v.name,
    sector: v.sector || null,
    website: v.website || null,
    billing_email: v.billingEmail || null,
    representative_id: session.userId,
  });

  if (error) {
    return { message: `Could not set up your organisation: ${error.message}` };
  }

  redirect("/organisation");
}

/**
 * Edit counterpart to createOrganisation, for after setup. Only works for
 * the org's representative — organisations_update RLS (0002) is keyed to
 * representative_id, same limitation noted on setOrganisationEvidence/Logo
 * below (an invited org_admin teammate can't call this yet).
 */
export async function updateOrganisation(
  organisationId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const validated = OrganisationSchema.safeParse({
    name: formData.get("name"),
    sector: formData.get("sector") || undefined,
    website: formData.get("website") || undefined,
    billingEmail: formData.get("billingEmail") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("organisations")
    .update({
      name: v.name,
      sector: v.sector || null,
      website: v.website || null,
      billing_email: v.billingEmail || null,
    })
    .eq("id", organisationId);

  if (error) {
    return { message: `Could not save your organisation details: ${error.message}` };
  }

  revalidatePath("/organisation");
  return {};
}

const OpportunitySchema = z
  .object({
    type: z.enum(["service", "project", "contract", "full_time", "squad"], { message: "Choose a type." }),
    title: z.string().trim().min(5, "Enter a title."),
    brief: z.string().trim().max(4000).optional(),
    category: z.enum(["creative_media", "digital_technology", "business_project_support"], {
      message: "Choose a category.",
    }),
    skills: z.string().trim().min(1, "List at least one required skill."),
    location: z.string().trim().optional(),
    workMode: z.enum(["remote", "on_site", "hybrid", "any"]),
    engagementType: z.enum(
      ["freelance", "fixed_term_contract", "full_time", "internship", "apprenticeship", "managed_service"],
      { message: "Choose an engagement type." }
    ),
    paymentBasis: z.enum(["fixed", "milestone", "hourly", "daily", "monthly", "negotiable"], {
      message: "Choose how this is paid.",
    }),
    compensationAmount: z.string().trim().optional(),
    compensationMin: z.string().trim().optional(),
    compensationMax: z.string().trim().optional(),
    currency: z.string().trim().min(1).default("SSP"),
    applicationDeadline: z.string().trim().optional(),
    numberOfOpenings: z.string().trim().optional(),
    shortlistingMode: z.enum(["self_service", "staff_assisted"]).default("staff_assisted"),
  })
  .refine(
    (v) => {
      const amount = Number(v.compensationAmount || 0);
      const min = Number(v.compensationMin || 0);
      const max = Number(v.compensationMax || 0);
      return amount > 0 || min > 0 || max > 0;
    },
    {
      message: "AdorWorks only lists paid opportunities — enter an amount or a range.",
      path: ["compensationAmount"],
    }
  );

function splitSkills(value: string) {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

const ScreeningQuestionsSchema = z
  .array(
    z.object({
      text: z.string().trim().min(3),
      required: z.boolean(),
    })
  )
  .max(10);

function parseScreeningQuestions(raw: FormDataEntryValue | null) {
  if (!raw || typeof raw !== "string") return [];
  try {
    const parsed = ScreeningQuestionsSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

function toNullableNumber(value: string | undefined) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Creates an opportunity in 'pending_review' — never 'open'. Publishing
 * (moving it to 'open') is the staff moderation gate the static site's
 * for-employers intake always had; this self-service form feeds the
 * same queue (staff/opportunities.html already has an "Approve & open"
 * action for pending_review rows) rather than replacing it. Even if this
 * action tried to pass status through, 0010's guard_opportunities_insert
 * trigger would reject it — status is never taken from client input here
 * on purpose, not just because the trigger would catch it.
 */
export async function createOpportunity(organisationId: string, _prevState: FormState, formData: FormData): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const validated = OpportunitySchema.safeParse({
    type: formData.get("type"),
    title: formData.get("title"),
    brief: formData.get("brief") || undefined,
    category: formData.get("category"),
    skills: formData.get("skills"),
    location: formData.get("location") || undefined,
    workMode: formData.get("workMode"),
    engagementType: formData.get("engagementType"),
    paymentBasis: formData.get("paymentBasis"),
    compensationAmount: formData.get("compensationAmount") || undefined,
    compensationMin: formData.get("compensationMin") || undefined,
    compensationMax: formData.get("compensationMax") || undefined,
    currency: formData.get("currency") || "SSP",
    applicationDeadline: formData.get("applicationDeadline") || undefined,
    numberOfOpenings: formData.get("numberOfOpenings") || undefined,
    shortlistingMode: formData.get("shortlistingMode") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;
  const screeningQuestions = parseScreeningQuestions(formData.get("screeningQuestions"));
  const servicePackageId = (formData.get("servicePackageId") as string | null)?.trim() || null;

  const supabase = await createClient();
  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .insert({
      organisation_id: organisationId,
      type: v.type,
      title: v.title,
      brief: v.brief || null,
      category: v.category,
      skills: splitSkills(v.skills),
      location: v.location || null,
      work_mode: v.workMode,
      engagement_type: v.engagementType,
      payment_basis: v.paymentBasis,
      compensation_amount: toNullableNumber(v.compensationAmount),
      compensation_min: toNullableNumber(v.compensationMin),
      compensation_max: toNullableNumber(v.compensationMax),
      currency: v.currency,
      application_deadline: v.applicationDeadline || null,
      number_of_openings: v.numberOfOpenings ? Math.max(1, Number(v.numberOfOpenings)) : 1,
      // FK to service_packages — the DB itself rejects an invalid/stale id,
      // so no separate existence check is needed here.
      service_package_id: v.type === "service" ? servicePackageId : null,
      visibility: "public",
      status: "pending_review",
      shortlisting_mode: v.shortlistingMode,
    })
    .select("id")
    .single();

  if (error) {
    return { message: `Could not submit this opportunity: ${error.message}` };
  }

  if (screeningQuestions.length > 0) {
    await supabase.from("screening_questions").insert(
      screeningQuestions.map((q, i) => ({
        opportunity_id: opportunity.id,
        question: q.text,
        required: q.required,
        sequence: i,
      }))
    );
  }

  redirect("/organisation?posted=1");
}

/**
 * Lets an org rep flip who shortlists candidates for one of their own
 * opportunities, any time after posting. RLS (opportunities_update, 0002)
 * already allows the representative to update any non-guarded column, so
 * no trigger change was needed here — only the applications_select/update
 * policies added in 0030 actually change behaviour based on this value.
 */
export async function setShortlistingMode(
  opportunityId: string,
  mode: "self_service" | "staff_assisted"
): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("opportunities")
    .update({ shortlisting_mode: mode })
    .eq("id", opportunityId);
  if (error) return { message: `Could not update this: ${error.message}` };

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}

/**
 * Records the storage path of an uploaded registration document. Only
 * works for the org's representative — organisations_update RLS (0002)
 * and the org-documents storage policy (0004) are both keyed to
 * representative_id specifically, not is_org_admin(), so an invited admin
 * teammate can't call this successfully yet (left as-is deliberately, see
 * the Phase 3 team-permissions plan).
 */
export async function setOrganisationEvidence(organisationId: string, filePath: string): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase
    .from("organisations")
    .update({ registration_evidence_path: filePath })
    .eq("id", organisationId);

  if (error) {
    return { message: `Could not save this document: ${error.message}` };
  }
  return {};
}

/** Same representative_id-only pattern as setOrganisationEvidence above, for the org's logo instead. */
export async function setOrganisationLogo(organisationId: string, filePath: string): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const supabase = await createClient();
  const { error } = await supabase.from("organisations").update({ logo_path: filePath }).eq("id", organisationId);

  if (error) {
    return { message: `Could not save your logo: ${error.message}` };
  }
  return {};
}
