"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { TalentServiceRow } from "@/lib/database.types";
import type { FormState } from "./auth";

export interface ServiceFormState extends FormState {
  success?: boolean;
}

/**
 * Service Studio. createService/updateService/deleteService are
 * draft-only, per 0037's original RLS. The lifecycle actions below
 * (0042) add the rest: submit for review, staff publish/reject (via the
 * staff console, not here), and talent self-service pause/resume/
 * withdraw/revise.
 */

const ServiceSchema = z.object({
  title: z.string().trim().min(3, "Give this service a title."),
  category: z
    .enum(["creative_media", "digital_technology", "business_project_support"])
    .optional(),
  problemSolved: z.string().trim().max(2000).optional(),
  deliverables: z.string().trim().max(2000).optional(),
  exclusions: z.string().trim().max(2000).optional(),
  paymentBasis: z.enum(["fixed", "milestone", "hourly", "daily", "monthly", "negotiable"]).optional(),
  price: z.string().trim().optional(),
  currency: z.string().trim().max(10).optional(),
  turnaround: z.string().trim().max(200).optional(),
});

function toNullableNumber(value: string | undefined) {
  if (!value) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

export async function createService(_prevState: ServiceFormState, formData: FormData): Promise<ServiceFormState> {
  const session = await requireRole("talent");

  const validated = ServiceSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category") || undefined,
    problemSolved: formData.get("problemSolved") || undefined,
    deliverables: formData.get("deliverables") || undefined,
    exclusions: formData.get("exclusions") || undefined,
    paymentBasis: formData.get("paymentBasis") || undefined,
    price: formData.get("price") || undefined,
    currency: formData.get("currency") || undefined,
    turnaround: formData.get("turnaround") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { error } = await supabase.from("talent_services").insert({
    talent_id: session.userId,
    title: v.title,
    category: v.category || null,
    problem_solved: v.problemSolved || null,
    deliverables: v.deliverables || null,
    exclusions: v.exclusions || null,
    payment_basis: v.paymentBasis || null,
    price: toNullableNumber(v.price),
    currency: v.currency || "SSP",
    turnaround: v.turnaround || null,
  });
  if (error) return { message: `Could not save this service: ${error.message}` };

  revalidatePath("/passport/services");
  return { success: true };
}

export async function updateService(
  serviceId: string,
  _prevState: ServiceFormState,
  formData: FormData
): Promise<ServiceFormState> {
  await requireRole("talent");

  const validated = ServiceSchema.safeParse({
    title: formData.get("title"),
    category: formData.get("category") || undefined,
    problemSolved: formData.get("problemSolved") || undefined,
    deliverables: formData.get("deliverables") || undefined,
    exclusions: formData.get("exclusions") || undefined,
    paymentBasis: formData.get("paymentBasis") || undefined,
    price: formData.get("price") || undefined,
    currency: formData.get("currency") || undefined,
    turnaround: formData.get("turnaround") || undefined,
  });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const v = validated.data;

  const supabase = await createClient();
  const { error } = await supabase
    .from("talent_services")
    .update({
      title: v.title,
      category: v.category || null,
      problem_solved: v.problemSolved || null,
      deliverables: v.deliverables || null,
      exclusions: v.exclusions || null,
      payment_basis: v.paymentBasis || null,
      price: toNullableNumber(v.price),
      currency: v.currency || "SSP",
      turnaround: v.turnaround || null,
    })
    .eq("id", serviceId);
  // RLS silently affects zero rows if this isn't the owner's own draft —
  // no separate ownership check needed here.
  if (error) return { message: `Could not save this service: ${error.message}` };

  revalidatePath("/passport/services");
  return { success: true };
}

export async function deleteService(serviceId: string): Promise<{ error?: string }> {
  await requireRole("talent");
  const supabase = await createClient();
  const { error } = await supabase.from("talent_services").delete().eq("id", serviceId);
  if (error) return { error: error.message };

  revalidatePath("/passport/services");
  return {};
}

/**
 * Stage 3 lifecycle actions (0042) — each is a single, narrow status
 * transition the guard_talent_services_update() trigger allows without
 * staff. Uses the plain RLS-gated client, same as resubmitOpportunity:
 * the widened update policy plus the trigger are what make this safe, not
 * an admin-client ownership check.
 */

async function transitionService(serviceId: string, status: TalentServiceRow["status"]): Promise<{ error?: string }> {
  await requireRole("talent");
  const supabase = await createClient();
  const { error } = await supabase.from("talent_services").update({ status }).eq("id", serviceId);
  if (error) return { error: error.message };

  revalidatePath("/passport/services");
  return {};
}

/**
 * draft -> pending_review: hands a draft to staff for review. Checks
 * completeness here first for a friendly, specific error message —
 * guard_talent_services_update() (0043) enforces the same requirement at
 * the database layer regardless, so this is a UX nicety, not the real
 * security boundary.
 */
export async function submitService(serviceId: string): Promise<{ error?: string }> {
  await requireRole("talent");
  const supabase = await createClient();
  const { data: service } = await supabase
    .from("talent_services")
    .select("category, deliverables, payment_basis, price")
    .eq("id", serviceId)
    .maybeSingle();
  if (!service) return { error: "Service not found." };

  const missing = [
    !service.category && "a category",
    !service.deliverables && "deliverables",
    !service.payment_basis && "a pricing basis",
    !service.price && "a price",
  ].filter(Boolean);
  if (missing.length > 0) {
    return { error: `Add ${missing.join(", ")} before submitting for review.` };
  }

  return transitionService(serviceId, "pending_review");
}

/** rejected | published | paused -> draft: reopens a service for editing before resubmitting. */
export async function reviseService(serviceId: string): Promise<{ error?: string }> {
  return transitionService(serviceId, "draft");
}

/** published -> paused: temporarily pulls a live service off Browse Services. */
export async function pauseService(serviceId: string): Promise<{ error?: string }> {
  return transitionService(serviceId, "paused");
}

/** paused -> published: makes a paused service live again without re-review. */
export async function resumeService(serviceId: string): Promise<{ error?: string }> {
  return transitionService(serviceId, "published");
}

/** Any non-removed status -> removed: a soft, permanent withdrawal (keeps history, unlike deleteService's hard delete). */
export async function withdrawService(serviceId: string): Promise<{ error?: string }> {
  return transitionService(serviceId, "removed");
}
