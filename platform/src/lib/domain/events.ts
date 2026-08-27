/**
 * Stable event names for audit and product instrumentation. Stage 1 fixes
 * the vocabulary; later stages add the transactional outbox/audit storage
 * and emit only events whose underlying business action succeeded.
 */
export const DOMAIN_EVENTS = {
  ACCOUNT_CREATED: "identity.account.created",
  ROLE_CONTEXT_SWITCHED: "identity.role_context.switched",
  TALENT_PROFILE_UPDATED: "talent.profile.updated",
  VERIFICATION_SUBMITTED: "trust.verification.submitted",
  VERIFICATION_DECIDED: "trust.verification.decided",
  ASSISTANCE_CONSENTED: "assistance.session.consented",
  ASSISTANCE_REVOKED: "assistance.session.revoked",
  OPPORTUNITY_SUBMITTED: "opportunity.submitted",
  OPPORTUNITY_PUBLISHED: "opportunity.published",
  OPPORTUNITY_REJECTED: "opportunity.rejected",
  APPLICATION_SUBMITTED: "application.submitted",
  APPLICATION_STAGE_CHANGED: "application.stage_changed",
  OFFER_SENT: "offer.sent",
  OFFER_RESPONDED: "offer.responded",
  CONTRACT_CREATED: "contract.created",
  CONTRACT_STATUS_CHANGED: "contract.status_changed",
  MILESTONE_STATUS_CHANGED: "milestone.status_changed",
  MESSAGE_SENT: "message.sent",
  DISPUTE_RAISED: "case.dispute.raised",
  DISPUTE_RESOLVED: "case.dispute.resolved",
  PAYMENT_STATUS_CHANGED: "payment.status_changed",
} as const;

export type DomainEventName = (typeof DOMAIN_EVENTS)[keyof typeof DOMAIN_EVENTS];

export interface DomainEventEnvelope {
  name: DomainEventName;
  occurredAt: string;
  actorId: string | null;
  subjectId?: string | null;
  entityType: string;
  entityId: string;
  reason?: string | null;
  source: "platform" | "staff_api" | "database" | "public_site";
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  metadata?: Record<string, unknown>;
}
