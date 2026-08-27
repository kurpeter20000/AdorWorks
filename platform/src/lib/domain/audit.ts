import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { DomainEventEnvelope } from "./events";

/**
 * Writes one row to audit_events (0035). Takes an admin/service-role
 * client deliberately — audit_events has no insert policy for regular
 * users, same pattern as verification_events/engagement_events/
 * assisted_field_changes, since only a trusted server context can
 * guarantee who actually performed an action.
 *
 * Fails open: a broken audit write must never roll back or block the real
 * business action it's describing. Callers should call this AFTER the
 * underlying write has already succeeded, never before or instead of it.
 */
export async function logAuditEvent(
  admin: SupabaseClient<Database>,
  event: Omit<DomainEventEnvelope, "occurredAt">
): Promise<void> {
  try {
    const { error } = await admin.from("audit_events").insert({
      name: event.name,
      actor_id: event.actorId,
      subject_id: event.subjectId ?? null,
      entity_type: event.entityType,
      entity_id: event.entityId,
      reason: event.reason ?? null,
      source: event.source,
      before: event.before ?? null,
      after: event.after ?? null,
      metadata: event.metadata ?? {},
    });
    if (error) console.error(`audit_events insert failed for ${event.name}:`, error.message);
  } catch (err) {
    console.error(`audit_events insert threw for ${event.name}:`, err);
  }
}
