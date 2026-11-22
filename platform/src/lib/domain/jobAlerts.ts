/**
 * Tailored job alerts (0126). A talent switches alerts on and narrows
 * them by field, keywords, kind of work, work mode and place. Pure, so the
 * matching rules are tested on their own (jobAlerts.test.ts).
 */
export type JobAlertPrefs = {
  job_alert_categories: string[];
  job_alert_keywords: string[];
  job_alert_engagement_types: string[];
  job_alert_work_modes: string[];
  job_alert_locations: string[];
};

export type AlertJob = {
  title: string;
  brief: string | null;
  category: string | null;
  skills: string[] | null;
  engagement_type: string | null;
  work_mode: string | null;
  location: string | null;
};

/** What the talent's own profile says, used when they haven't picked fields or keywords. */
export type TalentBasics = { category: string | null; skills: string[] | null };

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

/** Splits a typed list ("design, Figma; logo") into tidy, unique entries. */
export function splitList(raw: string, max: number, maxLen = 60): string[] {
  const out: string[] = [];
  for (const piece of raw.split(/[,;\n]/)) {
    const v = piece.replace(/\s+/g, " ").trim().slice(0, maxLen);
    if (v && !out.some((o) => norm(o) === norm(v))) out.push(v);
    if (out.length >= max) break;
  }
  return out;
}

function mentions(job: AlertJob, words: string[]): boolean {
  const hay = norm([job.title, job.brief ?? "", ...(job.skills ?? [])].join(" "));
  return words.some((w) => {
    const k = norm(w);
    return k.length > 0 && hay.includes(k);
  });
}

/**
 * Does this job match the alert? Each filter left empty means "any". If
 * the talent chose neither fields nor keywords, their profile's field and
 * skills stand in, so a bare "alerts on" still means "work in my field",
 * not every job on the platform.
 */
export function jobMatchesAlert(prefs: JobAlertPrefs, job: AlertJob, talent: TalentBasics): boolean {
  let categories = prefs.job_alert_categories;
  let keywords = prefs.job_alert_keywords;
  if (categories.length === 0 && keywords.length === 0) {
    categories = talent.category ? [talent.category] : [];
    keywords = talent.skills ?? [];
    // Nothing to go on at all: don't flood them with every job.
    if (categories.length === 0 && keywords.length === 0) return false;
    // From the profile, field OR a skill is enough.
    const fieldOk = categories.length > 0 && job.category !== null && categories.includes(job.category);
    if (!fieldOk && !mentions(job, keywords)) return false;
  } else {
    if (categories.length > 0 && (!job.category || !categories.includes(job.category))) return false;
    if (keywords.length > 0 && !mentions(job, keywords)) return false;
  }

  if (prefs.job_alert_engagement_types.length > 0 && (!job.engagement_type || !prefs.job_alert_engagement_types.includes(job.engagement_type))) {
    return false;
  }

  const modes = prefs.job_alert_work_modes;
  if (modes.length > 0 && job.work_mode && job.work_mode !== "any" && !modes.includes(job.work_mode)) return false;

  // Places only matter for work done in person; remote work goes anywhere.
  const places = prefs.job_alert_locations;
  if (places.length > 0 && job.work_mode !== "remote") {
    const where = norm(job.location ?? "");
    if (!where || !places.some((p) => where.includes(norm(p)))) return false;
  }
  return true;
}
