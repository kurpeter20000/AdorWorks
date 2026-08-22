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

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
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
        };
        Insert: Partial<Database["public"]["Tables"]["profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["profiles"]["Row"]>;
        Relationships: [];
      };
      talent_profiles: {
        Row: {
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
          work_mode: "remote" | "on_site" | "hybrid" | "any" | null;
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
        };
        Insert: Partial<Database["public"]["Tables"]["talent_profiles"]["Row"]> & { id: string };
        Update: Partial<Database["public"]["Tables"]["talent_profiles"]["Row"]>;
        Relationships: [];
      };
      organisations: {
        Row: {
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
        };
        Insert: Partial<Database["public"]["Tables"]["organisations"]["Row"]> & {
          name: string;
          representative_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["organisations"]["Row"]>;
        Relationships: [];
      };
      organisation_members: {
        Row: {
          id: string;
          organisation_id: string;
          user_id: string;
          role: "member" | "admin";
          created_at: string;
        };
        Insert: Partial<Database["public"]["Tables"]["organisation_members"]["Row"]> & {
          organisation_id: string;
          user_id: string;
        };
        Update: Partial<Database["public"]["Tables"]["organisation_members"]["Row"]>;
        Relationships: [];
      };
      honorifics: {
        Row: { code: string; label: string };
        Insert: { code: string; label: string };
        Update: Partial<{ code: string; label: string }>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
