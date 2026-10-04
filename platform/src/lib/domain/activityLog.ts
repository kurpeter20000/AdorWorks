import { msg } from "@/i18n/config";

/**
 * Human labels for the event names organisation_activity_log() (0102)
 * can return — a subset of DOMAIN_EVENTS (events.ts), scoped to the six
 * entity types that function resolves back to an organisation. Anything
 * not in this map falls back to the raw event name, so a future event
 * type never silently disappears from the feed, just shows unstyled
 * until someone adds a label.
 */
export const ACTIVITY_EVENT_LABEL: Record<string, string> = {
  "opportunity.submitted": msg("Submitted an opportunity for review"),
  "opportunity.published": msg("Published an opportunity"),
  "opportunity.rejected": msg("An opportunity was rejected"),
  "opportunity.changes_requested": msg("Changes were requested on an opportunity"),
  "opportunity.paused": msg("Paused an opportunity"),
  "offer.sent": msg("Sent an offer"),
  "offer.responded": msg("An offer response was received"),
  "contract.created": msg("A contract was created"),
  "contract.status_changed": msg("Contract status changed"),
  "milestone.status_changed": msg("Milestone status changed"),
  "organisation.team_member.invited": msg("Invited a teammate"),
  "organisation.team_member.role_changed": msg("Changed a teammate's role"),
  "organisation.team_member.removed": msg("Removed a teammate"),
};
