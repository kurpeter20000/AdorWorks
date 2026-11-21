import { msg } from "@/i18n/config";

/**
 * Spec "Staff feedback on posts: reason and fields to fix shown on the
 * opportunity". Staff tick these when they ask for changes (0112); the
 * employer sees the list on their opportunity and the edit link.
 */
export const CHANGE_FIELDS = {
  title: msg("Title"),
  brief: msg("Description of the work"),
  pay: msg("Pay — give an amount, or a minimum and a maximum"),
  skills: msg("Skills asked for"),
  location: msg("Location or work mode"),
  deadline: msg("Closing date"),
  contact: msg("Remove phone numbers, emails and WhatsApp — talent contact you through AdorWorks"),
  fees: msg("Remove any fee or deposit asked of talent"),
} as const;

export type ChangeField = keyof typeof CHANGE_FIELDS;
export const CHANGE_FIELD_KEYS = Object.keys(CHANGE_FIELDS) as ChangeField[];

export function isChangeField(v: unknown): v is ChangeField {
  return typeof v === "string" && v in CHANGE_FIELDS;
}
