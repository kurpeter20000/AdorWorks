"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { msg } from "@/i18n/config";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { normalisePhone } from "@/lib/domain/payoutMethods";

export type PayoutMethodState = { saved?: boolean; message?: string; errors?: Record<string, string[] | undefined> };

const Schema = z.discriminatedUnion("method", [
  z.object({ method: z.enum(["mtn_momo", "mgurush"]), phone: z.string().trim().min(1, msg("Enter the number the money should go to.")) }),
  z.object({
    method: z.literal("bank"),
    bank_name: z.string().trim().min(2, msg("Enter the bank's name.")).max(120),
    account_name: z.string().trim().min(2, msg("Enter the name on the account.")).max(120),
    account_number: z.string().trim().regex(/^[0-9A-Za-z -]{4,40}$/, msg("Enter the account number.")),
  }),
]);

/** The talent's own payout details (0114); finance staff read them to pay out. */
export async function savePayoutMethod(_prev: PayoutMethodState, formData: FormData): Promise<PayoutMethodState> {
  const session = await requireRole("talent");
  const parsed = Schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { errors: parsed.error.flatten().fieldErrors as Record<string, string[]> };
  const v = parsed.data;

  let row;
  if (v.method === "bank") {
    row = { talent_id: session.userId, method: v.method, phone: null, bank_name: v.bank_name, account_name: v.account_name, account_number: v.account_number };
  } else {
    const phone = normalisePhone(v.phone);
    if (!phone) return { errors: { phone: [msg("Enter a phone number, like 0912 345 678.")] } };
    row = { talent_id: session.userId, method: v.method, phone, bank_name: null, account_name: null, account_number: null };
  }
  const supabase = await createClient();
  const { error } = await supabase.from("talent_payout_methods").upsert(row, { onConflict: "talent_id" });
  if (error) return { message: msg("Couldn't save — please try again.") };
  revalidatePath("/finance");
  return { saved: true };
}
