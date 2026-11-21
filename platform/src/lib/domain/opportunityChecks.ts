/**
 * Automatic checks staff see before publishing an opportunity (spec:
 * "Opportunity review screen — pay stated, no fee to talent, no scam
 * signals"). They only flag things for a person to look at; the staff
 * member still decides.
 */
export interface OpportunityCheck {
  key: "pay" | "no_fee" | "no_contact" | "verified_employer";
  label: string;
  ok: boolean;
  note: string;
}

export interface CheckableOpportunity {
  title: string;
  brief: string | null;
  payment_basis: string | null;
  compensation_amount: number | null;
  compensation_min: number | null;
  compensation_max: number | null;
  currency: string | null;
}

// Asking talent for money is the most common job scam. Phrases, not
// single words, so "fees are paid by us" style text doesn't trip it.
const FEE_PATTERNS: RegExp[] = [
  /\b(registration|application|processing|training|joining|interview|medical|uniform|admin(istration)?|placement|booking)\s+fees?\b/i,
  /\bpay\s+(a\s+|the\s+)?(small\s+)?(fee|deposit|charge)\b/i,
  /\bpay\s+(us\s+)?(before|to)\s+(apply|start|join|be\s+considered)\b/i,
  /\b(refundable\s+)?deposit\s+(of|is|required)\b/i,
  /\bsend\s+(the\s+)?(money|payment|cash)\b/i,
];

// Contact details pull talent off the platform, away from its protection.
// A phone number: a run of 9+ digits (spaces, dashes, brackets allowed),
// but not a date like 2026-11-16.
function hasPhone(text: string): boolean {
  for (const m of text.matchAll(/\+?\d[\d\s().-]{6,}\d/g)) {
    const run = m[0];
    if (/^\d{4}-\d{2}-\d{2}$/.test(run.trim())) continue;
    if (run.replace(/\D/g, "").length >= 9) return true;
  }
  return false;
}

const CONTACT_PATTERNS: { re: { test: (s: string) => boolean }; what: string }[] = [
  { re: { test: hasPhone }, what: "a phone number" },
  { re: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i, what: "an email address" },
  { re: /\b(wa\.me|whats\s?app|telegram|t\.me\/)/i, what: "a WhatsApp or Telegram contact" },
];

function hasPay(o: CheckableOpportunity): boolean {
  if (o.payment_basis === "negotiable") return false;
  return (o.compensation_amount ?? 0) > 0 || ((o.compensation_min ?? 0) > 0 && (o.compensation_max ?? 0) >= (o.compensation_min ?? 0));
}

function payText(o: CheckableOpportunity): string {
  const c = o.currency || "SSP";
  if ((o.compensation_amount ?? 0) > 0) return `${c} ${o.compensation_amount!.toLocaleString("en-GB")}`;
  if ((o.compensation_min ?? 0) > 0 && o.compensation_max) {
    return `${c} ${o.compensation_min!.toLocaleString("en-GB")}–${o.compensation_max.toLocaleString("en-GB")}`;
  }
  return o.payment_basis === "negotiable" ? 'Says "negotiable"' : "No amount or range";
}

export function checkOpportunity(o: CheckableOpportunity, employerStatus?: string | null): OpportunityCheck[] {
  const text = `${o.title}\n${o.brief ?? ""}`;
  const fee = FEE_PATTERNS.map((re) => text.match(re)?.[0]).find(Boolean);
  const contact = CONTACT_PATTERNS.find((p) => p.re.test(text));
  const pay = hasPay(o);
  return [
    { key: "pay", label: "Pay is stated", ok: pay, note: payText(o) },
    {
      key: "no_fee",
      label: "No fee charged to talent",
      ok: !fee,
      note: fee ? `Mentions "${fee.trim()}" — check it isn't asking talent to pay` : "No mention of fees or deposits for talent",
    },
    {
      key: "no_contact",
      label: "No personal contact details",
      ok: !contact,
      note: contact ? `Found ${contact.what} in the text` : "Talent will contact the employer through AdorWorks",
    },
    {
      key: "verified_employer",
      label: "Employer verified",
      ok: employerStatus === "verified",
      note: employerStatus ? `Organisation status: ${employerStatus.replace(/_/g, " ")}` : "Organisation status unknown",
    },
  ];
}
