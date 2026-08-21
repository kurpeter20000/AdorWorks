/** Maps the exact <option> label strings used in the site's HTML forms to the Postgres enum values they correspond to. Keep in sync with adorworks-site/for-talent.html, for-employers.html and find-talent.html. */

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
