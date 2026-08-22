// Fields an onboarding agent may ever touch on someone else's
// talent_profiles row — kept in sync by hand with ASSISTED_TALENT_FIELDS
// in backend/api/src/routes/assistedOnboarding.js (that file is the one
// that actually creates sessions and their scope; this list is the
// second, independent check on the write side, since RLS can't restrict
// by column name).
//
// Lives outside lib/actions/assistance.ts on purpose — a "use server"
// file can only export async functions, and this needs to be imported by
// both that Server Action file and any ordinary (client or server)
// module.
export const ASSISTED_TALENT_FIELDS = [
  "legal_name",
  "display_name",
  "headline",
  "bio",
  "location",
  "category",
  "skills",
  "languages",
  "availability",
] as const;
