/**
 * "Relevant" ranking used both on /opportunities?sort=relevant and the
 * talent dashboard's "Recommended for you" widget — one rule, not two
 * copies that could drift. Ranks by skill overlap with the talent's own
 * Passport skills, tie-broken by recency — deliberately never by pay or
 * employer reputation, so a new opportunity or a new talent profile
 * isn't buried (same fairness rule as the staff console's suggested-
 * candidates feature, staff/js/opportunities.js).
 */
export function rankBySkillOverlap<T extends { skills: string[] | null; created_at: string }>(
  items: T[],
  talentSkills: string[]
): T[] {
  const mySkills = new Set(talentSkills.map((s) => s.toLowerCase()));
  return [...items].sort((a, b) => {
    const aMatches = (a.skills ?? []).filter((s) => mySkills.has(s.toLowerCase())).length;
    const bMatches = (b.skills ?? []).filter((s) => mySkills.has(s.toLowerCase())).length;
    if (bMatches !== aMatches) return bMatches - aMatches;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });
}
