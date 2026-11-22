/**
 * Featured jobs (0126). Employers pay to have a job featured; staff
 * confirm payment and set how long it stays featured. Pure helpers, so
 * the ordering rule is tested on its own.
 */
export const FEATURE_DAY_OPTIONS = [7, 14, 30] as const;
export type FeatureDays = (typeof FEATURE_DAY_OPTIONS)[number];

export function isFeatured(o: { featured_until: string | null }, now: Date = new Date()): boolean {
  return Boolean(o.featured_until && new Date(o.featured_until).getTime() > now.getTime());
}

/** Featured jobs first (soonest-published first among them), then the newest. */
export function featuredFirst<T extends { featured_until: string | null; approved_at?: string | null; created_at: string }>(rows: T[], now: Date = new Date()): T[] {
  const when = (r: T) => new Date(r.approved_at || r.created_at).getTime();
  return rows.slice().sort((a, b) => {
    const fa = isFeatured(a, now) ? 1 : 0;
    const fb = isFeatured(b, now) ? 1 : 0;
    if (fa !== fb) return fb - fa;
    return when(b) - when(a);
  });
}
