import { msg } from "@/i18n/config";

/**
 * Structured locations (0126): city/town, county, state, country for
 * talent and organisations. South Sudan's ten states and three
 * administrative areas are a fixed list; county and city stay free text
 * (79+ counties, and towns change), and other countries take any state or
 * region name.
 */
export const SOUTH_SUDAN = "South Sudan";

export const SOUTH_SUDAN_STATES = [
  "Central Equatoria",
  "Eastern Equatoria",
  "Western Equatoria",
  "Jonglei",
  "Unity",
  "Upper Nile",
  "Lakes",
  "Warrap",
  "Northern Bahr el Ghazal",
  "Western Bahr el Ghazal",
  "Abyei Administrative Area",
  "Pibor Administrative Area",
  "Ruweng Administrative Area",
] as const;

/** Suggested in the country box; any other country can be typed. */
export const COMMON_COUNTRIES = [SOUTH_SUDAN, "Uganda", "Kenya", "Sudan", "Ethiopia", "Egypt", "Rwanda", "Tanzania", "DR Congo", "Central African Republic"];

export type Place = { city?: string | null; county?: string | null; state?: string | null; country?: string | null };

const clean = (v: unknown, max = 80): string | null => {
  const s = String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
  return s || null;
};

/** Reads city/county/state/country from a form, tidied. */
export function placeFromForm(formData: FormData): Required<Place> {
  return {
    city: clean(formData.get("city")),
    county: clean(formData.get("county")),
    state: clean(formData.get("state")),
    country: clean(formData.get("country")),
  };
}

/** "Juba, Juba County, Central Equatoria, South Sudan" — skips blanks and repeats. */
export function formatPlace(p: Place | null | undefined, opts: { short?: boolean } = {}): string {
  if (!p) return "";
  const parts = opts.short ? [p.city, p.state, p.country] : [p.city, p.county, p.state, p.country];
  const seen = new Set<string>();
  return parts
    .map((x) => (x ?? "").trim())
    .filter((x) => {
      if (!x || seen.has(x.toLowerCase())) return false;
      seen.add(x.toLowerCase());
      return true;
    })
    .join(", ");
}

export const LOCATION_LABELS = {
  city: msg("City or town"),
  county: msg("County"),
  state: msg("State"),
  country: msg("Country"),
};
