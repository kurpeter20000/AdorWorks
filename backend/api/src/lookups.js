/** Maps the exact <option> label strings used in the site's HTML forms to the Postgres enum values they correspond to. Keep in sync with adorworks-site/for-talent.html and for-employers.html. */

export const CATEGORY_LABEL_TO_ENUM = {
  "Creative & media": "creative_media",
  "Digital & technology": "digital_technology",
  "Business & project support": "business_project_support",
};

export const HIRING_MODE_LABEL_TO_TYPE = {
  "Buy a service": "service",
  "Post a project": "project",
  "Hire contract talent": "contract",
  "Recruit full-time": "full_time",
  "Build a talent squad": "squad",
};

export function normalizeCategory(label) {
  if (!label) return null;
  return CATEGORY_LABEL_TO_ENUM[label] || null;
}

export function normalizeOpportunityType(label) {
  if (!label) return "project";
  return HIRING_MODE_LABEL_TO_TYPE[label] || "project";
}

/** Splits a free-text comma/semicolon-separated field ("React, Figma; Node") into a clean text[] for Postgres. */
export function splitList(value) {
  if (!value) return [];
  return String(value)
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * What a staff member typed into the lookup box: an email, an account id,
 * a phone number (last 6+ digits are enough), or part of a name.
 */
export function lookupKind(raw) {
  const value = raw.trim();
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return { kind: "email", value: value.toLowerCase() };
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) return { kind: "id", value: value.toLowerCase() };
  const digits = value.replace(/[\s()+-]/g, "");
  if (/^\d{6,15}$/.test(digits)) return { kind: "phone", value: digits.replace(/^0+/, "").slice(-9) };
  return { kind: "name", value: value.replace(/[%_,()]/g, " ").trim() };
}
