import type { AssistanceSessionRow } from "@/lib/database.types";

type AssistanceAccessFields = Pick<
  AssistanceSessionRow,
  "status" | "consent_recorded_at" | "expires_at" | "revoked_at" | "completed_at"
>;

export function isAssistanceSessionActive(
  session: AssistanceAccessFields,
  now: Date = new Date()
): boolean {
  const expiresAt = Date.parse(session.expires_at);
  return (
    session.status === "active" &&
    session.consent_recorded_at !== null &&
    session.revoked_at === null &&
    session.completed_at === null &&
    Number.isFinite(expiresAt) &&
    expiresAt > now.getTime()
  );
}

export function isAssistanceSessionExpired(
  session: Pick<AssistanceSessionRow, "status" | "expires_at">,
  now: Date = new Date()
): boolean {
  const canExpire = session.status === "pending_consent" || session.status === "active";
  return session.status === "expired" || (canExpire && Date.parse(session.expires_at) <= now.getTime());
}
