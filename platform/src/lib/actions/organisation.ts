"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireRole, CLIENT_ROLES } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
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

const ProjectBriefSchema = z.object({
  outcome: z.string().trim().min(10, "Describe the outcome you want in a bit more detail."),
  type: z.enum(["service", "project", "contract", "full_time", "squad"], { message: "Choose a type." }),
  category: z.enum(["creative_media", "digital_technology", "business_project_support"], {
    message: "Choose a category.",
  }),
  roughBudget: z.string().trim().optional(),
});

/**
 * Project Brief — the shorter, outcome-first counterpart to the Role
 * Canvas wizard (createOpportunity above). Deliberately asks for almost
 * nothing up front; the rest gets filled in later via resubmitOpportunity,
 * reusing the exact same OpportunityForm wizard (passed its `opportunity`
 * prop) rather than a second, differently-shaped form — a brief is still
 * just an `opportunities` row, parked at 'draft' (createOpportunity always
 * goes straight to 'pending_review') until someone finishes it. This is
 * deliberate: a separate table or pipeline here would mean the same kind
 * of duplicate, unequally-complete record problem the static site's old
 * "shortlist request" vs. "full brief" forms had.
 */
export async function createProjectBrief(
  organisationId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const validated = ProjectBriefSchema.safeParse({
    outcome: formData.get("outcome"),
    type: formData.get("type"),
    category: formData.get("category"),
    roughBudget: formData.get("roughBudget") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { data: opportunity, error } = await supabase
    .from("opportunities")
    .insert({
      organisation_id: organisationId,
      type: v.type,
      title: v.outcome.slice(0, 120),
      brief: v.outcome,
      category: v.category,
      skills: [],
      compensation_amount: toNullableNumber(v.roughBudget),
      currency: "SSP",
      visibility: "public",
      status: "draft",
    })
    .select("id")
    .single();

  if (error) {
    return { message: `Could not save this brief: ${error.message}` };
  }

  redirect(`/organisation/opportunities/${opportunity.id}/edit`);
}

/**
 * Completes and submits an opportunity for review — either staff sent it
 * back with 'changes_required' (0041), or it's a 'draft' Project Brief
 * (see createProjectBrief below) being finished off for the first time.
 * Reuses OpportunitySchema so the same validation applies as at creation.
 * 'rejected' stays terminal, by the same design intent recorded in
 * 0041_opportunity_changes_required.sql ("Reject remains available for
 * genuinely non-fixable submissions"). Uses the plain (RLS-gated) client,
 * not the admin client — is_org_write_member() (0039) already scopes
 * writes to non-viewer org members, and moving OUT of changes_required or
 * draft is unrestricted at the guard-trigger level for exactly this
 * purpose (guard_opportunities_update only gates transitions INTO
 * open/rejected/changes_required/paused).
 */
export async function resubmitOpportunity(
  opportunityId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
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

  const { data: existing } = await supabase
    .from("opportunities")
    .select("id, status")
    .eq("id", opportunityId)
    .maybeSingle();
  if (!existing) {
    return { message: "Opportunity not found." };
  }
  if (existing.status !== "changes_required" && existing.status !== "draft") {
    return { message: "This opportunity isn't awaiting changes right now." };
  }

  const { error } = await supabase
    .from("opportunities")
    .update({
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
      service_package_id: v.type === "service" ? servicePackageId : null,
      shortlisting_mode: v.shortlistingMode,
      status: "pending_review",
      status_note: null,
    })
    .eq("id", opportunityId);

  if (error) {
    return { message: `Could not resubmit this opportunity: ${error.message}` };
  }

  // Replace screening questions wholesale to match the edited set, same as
  // there being no partial-update path for them at creation time.
  await supabase.from("screening_questions").delete().eq("opportunity_id", opportunityId);
  if (screeningQuestions.length > 0) {
    await supabase.from("screening_questions").insert(
      screeningQuestions.map((q, i) => ({
        opportunity_id: opportunityId,
        question: q.text,
        required: q.required,
        sequence: i,
      }))
    );
  }

  redirect(`/organisation/opportunities/${opportunityId}?resubmitted=1`);
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

/**
 * The org's response to a verification check staff marked
 * 'information_required', or an appeal after 'rejected' — both handled
 * the same way, moving the check back to 'submitted' for staff to look at
 * again. Uses the admin client deliberately: verification_checks (0038)
 * has no write policy for org reps at all, only staff — this is the one
 * sanctioned path for an org to affect their own check, gated by an
 * explicit ownership check here instead of RLS.
 */
export async function submitVerificationInfo(
  organisationId: string,
  checkId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  const session = await requireRole(...CLIENT_ROLES);

  const note = String(formData.get("note") || "").trim();
  if (note.length < 5) {
    return { errors: { note: ["Add a little more detail."] } };
  }

  const supabase = await createClient();
  const { data: org } = await supabase.from("organisations").select("representative_id").eq("id", organisationId).maybeSingle();
  if (!org || org.representative_id !== session.userId) {
    return { message: "Only the organisation's representative can do this." };
  }

  const admin = createAdminClient();
  const { data: check } = await admin
    .from("verification_checks")
    .select("id, organisation_id, status")
    .eq("id", checkId)
    .single();
  if (!check || check.organisation_id !== organisationId) {
    return { message: "That verification check could not be found." };
  }
  if (check.status !== "information_required" && check.status !== "rejected") {
    return { message: "This check isn't awaiting a response right now." };
  }

  const { error } = await admin
    .from("verification_checks")
    .update({ status: "submitted", applicant_note: note })
    .eq("id", checkId);
  if (error) return { message: `Could not submit this: ${error.message}` };

  revalidatePath("/organisation");
  return {};
}

/**
 * Appeal for a rejected opportunity (0044) — 'rejected' stays terminal by
 * itself (see resubmitOpportunity's comment), so this deliberately does
 * NOT change status; it just records a note for staff, who can then
 * choose to reopen it via the existing "Request changes" action (already
 * usable on any status at the trigger level — only the staff console UI
 * was hiding it for rejected rows) or uphold the rejection. Plain client:
 * updating a non-status column on the org's own row is already permitted
 * by is_org_write_member() regardless of the row's current status.
 */
export async function appealOpportunityRejection(
  opportunityId: string,
  _prevState: FormState,
  formData: FormData
): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);

  const note = String(formData.get("note") || "").trim();
  if (note.length < 10) {
    return { errors: { note: ["Say a bit more about why you think this should be reconsidered."] } };
  }

  const supabase = await createClient();
  const { data: existing } = await supabase.from("opportunities").select("status").eq("id", opportunityId).maybeSingle();
  if (!existing) return { message: "Opportunity not found." };
  if (existing.status !== "rejected") return { message: "This opportunity isn't in a rejected state." };

  const { error } = await supabase
    .from("opportunities")
    .update({ appeal_note: note, appealed_at: new Date().toISOString() })
    .eq("id", opportunityId);
  if (error) return { message: `Could not submit this appeal: ${error.message}` };

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}

const CLOSE_STATUSES = ["filled", "closed", "cancelled"] as const;

/**
 * Self-service close/fill/cancel (playbook Stage 3 gap: staff were the
 * only path to end an opportunity's life other than rejection). None of
 * these three transitions were ever staff-gated by guard_opportunities_
 * update() — filled/closed/cancelled sit in the same tier as 'draft' —
 * so, like resubmitOpportunity, the plain client is enough; no new
 * trigger or RLS change was needed to allow this.
 */
export async function closeOpportunity(
  opportunityId: string,
  status: (typeof CLOSE_STATUSES)[number]
): Promise<FormState> {
  await requireRole(...CLIENT_ROLES);
  if (!CLOSE_STATUSES.includes(status)) {
    return { message: "Not a valid status for this action." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("opportunities").update({ status }).eq("id", opportunityId);
  if (error) return { message: `Could not update this: ${error.message}` };

  revalidatePath(`/organisation/opportunities/${opportunityId}`);
  return {};
}
