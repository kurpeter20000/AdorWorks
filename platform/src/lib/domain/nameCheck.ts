/**
 * Wallet name check (0125): does the name an MTN/mGurush wallet or bank
 * account is registered to match the talent's name? Names are written in
 * different orders and spellings, so this compares words, ignoring case,
 * accents and punctuation. "close" means some words match — a person
 * decides. Pure, so it is tested.
 */
export type NameMatch = "match" | "close" | "different";

const words = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z؀-ۿ\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

export function compareNames(onAccount: string, profileName: string): NameMatch {
  const a = words(onAccount);
  const b = words(profileName);
  if (!a.length || !b.length) return "different";
  const setB = new Set(b);
  const shared = a.filter((w) => setB.has(w)).length;
  const shorter = Math.min(a.length, b.length);
  if (shared >= Math.min(2, shorter) && shared === shorter) return "match";
  if (shared >= 1) return "close";
  return "different";
}
