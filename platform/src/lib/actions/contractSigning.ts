"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";

/**
 * Spec "contract to sign" (0113): the talent or the organisation confirms
 * the contract's current written terms. The database works out which
 * side the caller is on and refuses anyone else; signing the same
 * version twice changes nothing.
 */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function signContract(contractId: string, termsVersion: number): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!ID.test(contractId)) return { error: "Contract not found." };
  if (!Number.isInteger(termsVersion) || termsVersion < 1) return { error: "Open the contract page and try again." };
  // Signs exactly the version the person was shown; the database refuses
  // if the terms changed since (0115). The contract page has already put
  // the latest terms on record for the people allowed to see it.
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase.rpc("sign_contract", { p_contract_id: contractId, p_terms_version: termsVersion });
  if (error) return { error: error.message };
  await logAuditEvent(createAdminClient(), {
    name: DOMAIN_EVENTS.CONTRACT_SIGNED,
    actorId: session.userId,
    entityType: "contracts",
    entityId: contractId,
    source: "platform",
    metadata: { party: data?.party, termsVersion: data?.terms_version, contentHash: data?.content_hash },
  });
  revalidatePath(`/contracts/${contractId}`);
  revalidatePath("/dashboard");
  return {};
}
