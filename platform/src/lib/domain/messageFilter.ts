/**
 * Pre-payment contact-detail filter (Stage 16 step 3) — the same rule
 * Upwork and similar marketplaces use: phone numbers, email addresses and
 * messaging-app handles/links are blocked in messages until the first
 * payment for the engagement has gone through AdorWorks. After that,
 * AdorWorks has already been paid, so there's no reason to keep
 * controlling how two people already working together choose to talk.
 *
 * Deliberately a hard block (the send is refused, nothing is redacted or
 * silently stored) — matches the "we only get paid when you do" trust
 * story: no partial leakage, no guessing what got through.
 *
 * Known limitation, documented rather than over-engineered around: this
 * is a deterrent, not cryptographic enforcement. A phone number pasted as
 * one unbroken digit run with no spaces/dashes and no leading "+" (e.g.
 * "211912345678") isn't flagged, to avoid blocking ordinary numbers in
 * conversation (a budget, a quantity, a quoted price). Real marketplaces
 * with the same rule (Upwork included) accept this same tradeoff.
 */
export type ContactDetailKind = "phone" | "email" | "handle";

const EMAIL_RE = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
const PHONE_CANDIDATE_RE = /\+?\d[\d\s().-]{6,}\d/g;
const HANDLE_RE = /\b(whatsapp|telegram|wa\.me|t\.me|signal|imo)\b|@[a-z0-9_]{4,}\b/gi;

function isLikelyPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 13) return false;
  return /[\s().-]/.test(raw) || raw.trim().startsWith("+");
}

export function findContactDetails(text: string): ContactDetailKind[] {
  const found = new Set<ContactDetailKind>();
  // .test() on a /g-flagged regex mutates its own lastIndex, so these
  // three module-level consts — reused across every call — must have it
  // reset first, or a later call can silently start mid-string and miss
  // a real match.
  EMAIL_RE.lastIndex = 0;
  if (EMAIL_RE.test(text)) found.add("email");
  for (const m of text.matchAll(PHONE_CANDIDATE_RE)) {
    if (isLikelyPhone(m[0])) {
      found.add("phone");
      break;
    }
  }
  HANDLE_RE.lastIndex = 0;
  if (HANDLE_RE.test(text)) found.add("handle");
  return [...found];
}

export function containsContactDetails(text: string): boolean {
  return findContactDetails(text).length > 0;
}

export const CONTACT_DETAIL_BLOCKED_MESSAGE =
  "Phone numbers, emails and messaging-app handles can't be sent here yet — AdorWorks blocks them until the first payment on this engagement has gone through, so neither side is pulled off-platform into an unprotected exchange. This opens up once a payment is made.";
