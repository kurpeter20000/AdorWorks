"use server";

import { z } from "zod";
import { msg } from "@/i18n/config";
import { createAdminClient } from "@/lib/supabase/admin";
import { findUserByEmail } from "@/lib/supabase/findUserByEmail";
import { checkAndRecordAttempt, getClientIp } from "@/lib/domain/rateLimit";

export type AppealState = { sent?: boolean; message?: string; errors?: { email?: string[]; message?: string[] } };

const Schema = z.object({
  email: z.string().trim().toLowerCase().email(msg("Enter the email address of your account.")),
  message: z
    .string()
    .trim()
    .min(10, msg("Tell us a little more — at least 10 characters."))
    .max(4000, msg("Please keep it under 4,000 characters.")),
});

/**
 * Public suspension appeal (0112). A suspended account can't sign in, so
 * this page takes the account's email instead. It answers the same way
 * whether or not that email belongs to a suspended account, so it can't
 * be used to find out who is suspended; rate limited per email and IP.
 */
export async function submitAccountAppeal(_prev: AppealState, formData: FormData): Promise<AppealState> {
  const parsed = Schema.safeParse({ email: formData.get("email"), message: formData.get("message") });
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors };
  const { email, message } = parsed.data;

  const admin = createAdminClient();
  const [byEmail, byIp] = await Promise.all([
    checkAndRecordAttempt(admin, "account_appeal", email),
    checkAndRecordAttempt(admin, "account_appeal", `ip:${await getClientIp()}`),
  ]);
  if (!byEmail.allowed || !byIp.allowed) {
    return { message: msg("Too many attempts. Please try again in an hour.") };
  }

  const { user } = await findUserByEmail(admin, email);
  if (user) {
    const { data: profile } = await admin.from("profiles").select("status").eq("id", user.id).maybeSingle();
    if (profile?.status === "suspended") {
      const { error } = await admin.from("account_appeals").insert({ profile_id: user.id, message });
      // 23505 = an appeal is already open; the earlier one still stands.
      if (error && error.code !== "23505") console.error("account appeal insert failed:", error.message);
    }
  }
  return { sent: true };
}
