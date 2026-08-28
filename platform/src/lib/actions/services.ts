"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import type { FormState } from "./auth";

export interface ServiceFormState extends FormState {
  success?: boolean;
}

/**
 * Service Studio — Stage 2 draft-only foundation (0037). Every action here
 * only ever touches a 'draft' row, matching the RLS policies exactly:
 * there is no submit-for-review action yet. That, plus staff review and
 * publication, is Stage 3 work per the master document's own staging.
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
