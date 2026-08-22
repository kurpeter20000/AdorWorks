"use server";

import { z } from "zod";
import { randomInt, createHash } from "crypto";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendSms } from "@/lib/sms/africastalking";
import type { FormState } from "./auth";

const RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_TTL_MS = 10 * 60 * 1000;
const MAX_ATTEMPTS = 5;

function hashCode(code: string) {
  return createHash("sha256").update(code).digest("hex");
}

export interface SendOtpState extends FormState {
  sent?: boolean;
}

const PhoneSchema = z.object({
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, "Enter a phone number in international format, e.g. +211900000000."),
});

/**
 * Every write here goes through the admin client — phone_verification_codes
 * has RLS enabled with no policies (see 0019), and profiles.phone_verified
 * must never be settable by a user's own SSR-scoped session, only by this
 * action after it's actually checked a code (same principle
 * platform/README.md's Security notes section states for offers/contracts).
 */
export async function sendPhoneOtp(_prevState: SendOtpState, formData: FormData): Promise<SendOtpState> {
  const session = await requireSession();

  const validated = PhoneSchema.safeParse({ phone: formData.get("phone") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const { phone } = validated.data;

  const admin = createAdminClient();

  const { data: recent } = await admin
    .from("phone_verification_codes")
    .select("created_at")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (recent && Date.now() - new Date(recent.created_at).getTime() < RESEND_COOLDOWN_MS) {
    return { message: "Please wait a minute before requesting another code." };
  }

  const code = randomInt(100000, 1000000).toString();

  await admin.from("phone_verification_codes").delete().eq("user_id", session.userId);
  const { error: insertError } = await admin.from("phone_verification_codes").insert({
    user_id: session.userId,
    phone,
    code_hash: hashCode(code),
    expires_at: new Date(Date.now() + CODE_TTL_MS).toISOString(),
  });
  if (insertError) {
    return { message: `Could not start verification: ${insertError.message}` };
  }

  // Records the pending number immediately; phone_verified stays false
  // until verifyPhoneOtp succeeds.
  await admin.from("profiles").update({ phone }).eq("id", session.userId);

  try {
    await sendSms(phone, `Your AdorWorks verification code is ${code}. It expires in 10 minutes.`);
  } catch (err) {
    return { message: `Could not send the code: ${err instanceof Error ? err.message : "unknown error"}` };
  }

  return { sent: true };
}

const CodeSchema = z.object({
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});

export async function verifyPhoneOtp(_prevState: FormState, formData: FormData): Promise<FormState> {
  const session = await requireSession();

  const validated = CodeSchema.safeParse({ code: formData.get("code") });
  if (!validated.success) {
    return { errors: validated.error.flatten().fieldErrors };
  }
  const { code } = validated.data;

  const admin = createAdminClient();

  const { data: row } = await admin
    .from("phone_verification_codes")
    .select("id, code_hash, expires_at, attempts")
    .eq("user_id", session.userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!row || new Date(row.expires_at).getTime() < Date.now()) {
    return { message: "That code has expired — request a new one." };
  }
  if (row.attempts >= MAX_ATTEMPTS) {
    return { message: "Too many attempts — request a new code." };
  }

  if (hashCode(code) !== row.code_hash) {
    await admin
      .from("phone_verification_codes")
      .update({ attempts: row.attempts + 1 })
      .eq("id", row.id);
    return { message: "Incorrect code." };
  }

  await admin.from("profiles").update({ phone_verified: true }).eq("id", session.userId);
  await admin.from("phone_verification_codes").delete().eq("id", row.id);

  revalidatePath("/dashboard");
  return {};
}
