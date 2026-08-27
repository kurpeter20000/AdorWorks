// Mirrors platform/src/lib/domain/audit.ts's contract against the same
// audit_events table (0035) — this runtime can't import that TS module
// directly, so the event-name strings are kept in sync by hand with
// platform/src/lib/domain/events.ts. Same "fail open" rule: a broken
// audit write must never block the real action it describes.
export async function logAuditEvent(supabaseAdmin, event) {
  try {
    const { error } = await supabaseAdmin.from("audit_events").insert({
      name: event.name,
      actor_id: event.actorId,
      subject_id: event.subjectId ?? null,
      entity_type: event.entityType,
      entity_id: event.entityId,
      reason: event.reason ?? null,
      source: "staff_api",
      before: event.before ?? null,
      after: event.after ?? null,
      metadata: event.metadata ?? {},
    });
    if (error) console.error(`audit_events insert failed for ${event.name}:`, error.message);
  } catch (err) {
    console.error(`audit_events insert threw for ${event.name}:`, err);
  }
}
