/**
 * Hand-written Supabase types, kept in sync with
 * ../../../backend/supabase/migrations/*.sql by hand.
 *
 * This is a stopgap. Once you have the Supabase CLI authenticated
 * against the project, regenerate the authoritative version with:
 *
 *   npx supabase gen types typescript --project-id cpiebggzbxshzvlzqdfn --schema public > src/lib/database.types.ts
 *
 * That needs your Supabase access token (`npx supabase login`), not
 * anything that should be pasted into chat. Until then, every table
 * this app actually queries should have a matching entry below —
 * extend this file in the same commit as any new migration.
 *
 * Every Row/Database shape below is declared with `type X = {...}`,
 * never `interface X {...}` — confirmed by isolated testing that an
 * `interface` used as a table's `Row` breaks @supabase/supabase-js's
 * generic resolution silently (every query's inferred type collapses to
 * `never`, with no error at the point that actually goes wrong). Type
 * aliases with the identical shape work correctly. If you add a table,
 * keep using `type`.
 */

export type UserRole =
  | "talent"
  | "employer"
  | "reviewer"
  | "matcher"
  | "finance"
  | "admin"
  | "individual_client"
  | "org_member"
  | "org_admin"
  | "onboarding_agent"
  | "partner_hub_admin";

export type VerificationTier =
  | "registered"
  | "identity_verified"
  | "adorverified"
  | "adorcertified"
  | "team_lead";

export type Category = "creative_media" | "digital_technology" | "business_project_support";
export type WorkMode = "remote" | "on_site" | "hybrid" | "any";
export type EvidenceType = "portfolio" | "identity" | "reference" | "assessment";
export type EvidenceStatus = "pending" | "approved" | "rejected";

export type ProfileRow = {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  phone_verified: boolean;
  email_verified: boolean;
  status: "active" | "suspended" | "deleted";
  consent_terms_at: string | null;
  created_at: string;
  updated_at: string;
}

export type TalentProfileRow = {
  id: string;
  headline: string | null;
  bio: string | null;
  legal_name: string | null;
  display_name: string | null;
  honorific: string | null;
  category: Category | null;
  skills: string[];
  languages: string[];
  location: string | null;
  work_mode: WorkMode | null;
  rate_min: number | null;
  rate_max: number | null;
  currency: string | null;
  availability: string | null;
  years_experience: number | null;
  portfolio_url: string | null;
  readiness: Record<string, unknown>;
  verification_tier: VerificationTier;
  public_visible: boolean;
  created_at: string;
  updated_at: string;
}

export type OrganisationRow = {
  id: string;
  name: string;
  sector: string | null;
  website: string | null;
  registration_evidence_path: string | null;
  representative_id: string;
  billing_email: string | null;
  verification_status: "pending" | "verified" | "rejected" | "suspended";
  risk_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganisationMemberRow = {
  id: string;
  organisation_id: string;
  user_id: string;
  role: "member" | "admin";
  created_at: string;
}

export type HonorificRow = {
  code: string;
  label: string;
}

export type TalentEvidenceRow = {
  id: string;
  talent_id: string;
  evidence_type: EvidenceType;
  file_path: string | null;
  notes: string | null;
  status: EvidenceStatus;
  reviewer_id: string | null;
  reviewed_at: string | null;
  created_at: string;
}

export type Database = {
  // Recent @supabase/supabase-js versions look for this marker (present
  // in real `supabase gen types` output) to resolve the client's
  // generics correctly — without it, every table's inferred type
  // silently collapses to `never` instead of erroring loudly.
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: Partial<ProfileRow> & { id: string };
        Update: Partial<ProfileRow>;
        Relationships: [];
      };
      talent_profiles: {
        Row: TalentProfileRow;
        Insert: Partial<TalentProfileRow> & { id: string };
        Update: Partial<TalentProfileRow>;
        Relationships: [];
      };
      organisations: {
        Row: OrganisationRow;
        Insert: Partial<OrganisationRow> & { name: string; representative_id: string };
        Update: Partial<OrganisationRow>;
        Relationships: [];
      };
      organisation_members: {
        Row: OrganisationMemberRow;
        Insert: Partial<OrganisationMemberRow> & { organisation_id: string; user_id: string };
        Update: Partial<OrganisationMemberRow>;
        Relationships: [];
      };
      honorifics: {
        Row: HonorificRow;
        Insert: HonorificRow;
        Update: Partial<HonorificRow>;
        Relationships: [];
      };
      talent_evidence: {
        Row: TalentEvidenceRow;
        Insert: Partial<TalentEvidenceRow> & { talent_id: string; evidence_type: EvidenceType };
        Update: Partial<TalentEvidenceRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
