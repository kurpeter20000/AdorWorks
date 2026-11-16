"use server";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { ensureContractTerms } from "@/lib/dal/contractTerms";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";

/**
 * Spec "contract to sign" (0113): the talent or the organisation confirms
 * the contract's current written terms. The database works out which
 * side the caller is on and refuses anyone else; signing the same
 * version twice changes nothing.
 */
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function signContract(contractId: string): Promise<{ error?: string }> {
  const session = await requireSession();
  if (!ID.test(contractId)) return { error: "Contract not found." };
  // Make sure the latest written terms are on record before signing them.
  await ensureContractTerms(contractId, session.userId);
  const supabase = (await createClient()) as unknown as SupabaseClient;
  const { data, error } = await supabase.rpc("sign_contract", { p_contract_id: contractId });
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
