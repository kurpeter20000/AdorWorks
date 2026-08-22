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
export type OpportunityType = "service" | "project" | "contract" | "full_time" | "squad";
export type OpportunityStatus = "draft" | "pending_review" | "open" | "filled" | "closed" | "cancelled";
export type EngagementType =
  | "freelance"
  | "fixed_term_contract"
  | "full_time"
  | "internship"
  | "apprenticeship"
  | "managed_service";
export type PaymentBasis = "fixed" | "milestone" | "hourly" | "daily" | "monthly" | "negotiable";
export type ApplicationStage =
  | "submitted"
  | "shortlisted"
  | "interviewing"
  | "offered"
  | "accepted"
  | "rejected"
  | "withdrawn";
export type OfferStatus = "draft" | "sent" | "accepted" | "declined" | "withdrawn";
export type ContractStatus = "active" | "completed" | "cancelled" | "disputed";
export type MilestoneStatus = "pending" | "submitted" | "approved" | "revision_requested" | "paid";
export type DeliverableStatus = "submitted" | "approved" | "revision_requested";
export type PaymentEventStatus = "pending" | "succeeded" | "failed" | "refunded";
export type ReviewerRole = "talent" | "employer";

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

export type PhoneVerificationCodeRow = {
  id: string;
  user_id: string;
  phone: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
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
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  readiness: Record<string, unknown>;
  verification_tier: VerificationTier;
  public_visible: boolean;
  created_at: string;
  updated_at: string;
}

export type TalentPortfolioItemRow = {
  id: string;
  talent_id: string;
  title: string;
  description: string | null;
  external_url: string | null;
  file_path: string | null;
  sort_order: number;
  created_at: string;
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

export type OpportunityRow = {
  id: string;
  organisation_id: string;
  type: OpportunityType;
  title: string;
  brief: string | null;
  category: Category | null;
  skills: string[];
  location: string | null;
  work_mode: WorkMode | null;
  budget_min: number | null;
  budget_max: number | null;
  currency: string | null;
  start_date: string | null;
  deadline: string | null;
  visibility: "private" | "public";
  status: OpportunityStatus;
  created_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  engagement_type: EngagementType | null;
  payment_basis: PaymentBasis | null;
  compensation_amount: number | null;
  compensation_min: number | null;
  compensation_max: number | null;
  application_deadline: string | null;
  number_of_openings: number;
  created_at: string;
  updated_at: string;
}

export type ApplicationRow = {
  id: string;
  opportunity_id: string;
  talent_id: string;
  source: "applied" | "matched";
  suitability_score: number | null;
  notes: string | null;
  stage: ApplicationStage;
  decision_reason: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type OfferRow = {
  id: string;
  application_id: string;
  opportunity_id: string;
  talent_id: string;
  organisation_id: string;
  payment_basis: PaymentBasis;
  compensation_amount: number | null;
  currency: string;
  milestone_plan: unknown;
  message: string | null;
  status: OfferStatus;
  created_by: string;
  created_at: string;
  responded_at: string | null;
}

export type ContractRow = {
  id: string;
  offer_id: string;
  opportunity_id: string;
  talent_id: string;
  organisation_id: string;
  status: ContractStatus;
  started_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export type MilestoneRow = {
  id: string;
  contract_id: string;
  title: string;
  description: string | null;
  amount: number;
  currency: string;
  sequence: number;
  status: MilestoneStatus;
  due_date: string | null;
  created_at: string;
  updated_at: string;
}

export type DeliverableRow = {
  id: string;
  milestone_id: string;
  submitted_by: string;
  file_path: string | null;
  note: string | null;
  status: DeliverableStatus;
  created_at: string;
}

export type PaymentEventRow = {
  id: string;
  milestone_id: string | null;
  contract_id: string;
  provider_name: string;
  external_reference: string;
  amount: number;
  currency: string;
  status: PaymentEventStatus;
  is_simulated: boolean;
  created_at: string;
}

export type WorkHistoryRow = {
  id: string;
  talent_id: string;
  contract_id: string;
  organisation_id: string;
  title: string;
  summary: string | null;
  completed_at: string;
  created_at: string;
}

export type ConversationRow = {
  id: string;
  contract_id: string | null;
  application_id: string | null;
  created_at: string;
}

export type ConversationMemberRow = {
  conversation_id: string;
  user_id: string;
}

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export type ReviewRow = {
  id: string;
  engagement_id: string | null;
  contract_id: string | null;
  reviewer_role: ReviewerRole;
  reviewer_id: string;
  rating: number;
  feedback: string | null;
  created_at: string;
}

export type PartnerHubRow = {
  id: string;
  name: string;
  contact_email: string | null;
  contact_phone: string | null;
  location: string | null;
  status: "active" | "suspended";
  created_at: string;
}

export type OnboardingAgentRow = {
  id: string;
  partner_hub_id: string | null;
  status: "active" | "suspended";
  created_by: string | null;
  created_at: string;
}

export type AssistanceRequestRow = {
  id: string;
  requested_by: string | null;
  partner_hub_id: string | null;
  preferred_channel: string | null;
  preferred_language: string | null;
  location: string | null;
  reason: string | null;
  status: "pending" | "assigned" | "closed" | "cancelled";
  created_at: string;
}

export type AssistanceSessionScope = { fields: string[] };

export type AssistanceSessionRow = {
  id: string;
  assistance_request_id: string | null;
  agent_id: string;
  user_id: string;
  scope: AssistanceSessionScope;
  consent_recorded_at: string | null;
  expires_at: string;
  revoked_at: string | null;
  revoked_by: string | null;
  completed_at: string | null;
  status: "pending_consent" | "active" | "completed" | "revoked" | "expired";
  created_at: string;
}

export type AssistedFieldChangeRow = {
  id: string;
  session_id: string;
  field_table: string;
  field_name: string;
  old_value: string | null;
  new_value: string | null;
  changed_at: string;
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
      talent_portfolio_items: {
        Row: TalentPortfolioItemRow;
        Insert: Partial<TalentPortfolioItemRow> & { talent_id: string; title: string };
        Update: Partial<TalentPortfolioItemRow>;
        Relationships: [];
      };
      phone_verification_codes: {
        Row: PhoneVerificationCodeRow;
        Insert: Partial<PhoneVerificationCodeRow> & { user_id: string; phone: string; code_hash: string; expires_at: string };
        Update: Partial<PhoneVerificationCodeRow>;
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
      opportunities: {
        Row: OpportunityRow;
        Insert: Partial<OpportunityRow> & { organisation_id: string; type: OpportunityType; title: string };
        Update: Partial<OpportunityRow>;
        Relationships: [];
      };
      applications: {
        Row: ApplicationRow;
        Insert: Partial<ApplicationRow> & { opportunity_id: string; talent_id: string };
        Update: Partial<ApplicationRow>;
        Relationships: [];
      };
      offers: {
        Row: OfferRow;
        Insert: Partial<OfferRow> & {
          application_id: string;
          opportunity_id: string;
          talent_id: string;
          organisation_id: string;
          payment_basis: PaymentBasis;
          created_by: string;
        };
        Update: Partial<OfferRow>;
        Relationships: [];
      };
      contracts: {
        Row: ContractRow;
        Insert: Partial<ContractRow> & {
          offer_id: string;
          opportunity_id: string;
          talent_id: string;
          organisation_id: string;
        };
        Update: Partial<ContractRow>;
        Relationships: [];
      };
      milestones: {
        Row: MilestoneRow;
        Insert: Partial<MilestoneRow> & { contract_id: string; title: string; amount: number };
        Update: Partial<MilestoneRow>;
        Relationships: [];
      };
      deliverables: {
        Row: DeliverableRow;
        Insert: Partial<DeliverableRow> & { milestone_id: string; submitted_by: string };
        Update: Partial<DeliverableRow>;
        Relationships: [];
      };
      payment_events: {
        Row: PaymentEventRow;
        Insert: Partial<PaymentEventRow> & { contract_id: string; external_reference: string; amount: number };
        Update: Partial<PaymentEventRow>;
        Relationships: [];
      };
      work_history: {
        Row: WorkHistoryRow;
        Insert: Partial<WorkHistoryRow> & {
          talent_id: string;
          contract_id: string;
          organisation_id: string;
          title: string;
          completed_at: string;
        };
        Update: Partial<WorkHistoryRow>;
        Relationships: [];
      };
      conversations: {
        Row: ConversationRow;
        Insert: Partial<ConversationRow>;
        Update: Partial<ConversationRow>;
        Relationships: [];
      };
      conversation_members: {
        Row: ConversationMemberRow;
        Insert: ConversationMemberRow;
        Update: Partial<ConversationMemberRow>;
        Relationships: [];
      };
      messages: {
        Row: MessageRow;
        Insert: Partial<MessageRow> & { conversation_id: string; sender_id: string; body: string };
        Update: Partial<MessageRow>;
        Relationships: [];
      };
      reviews: {
        Row: ReviewRow;
        Insert: Partial<ReviewRow> & { reviewer_role: ReviewerRole; reviewer_id: string; rating: number };
        Update: Partial<ReviewRow>;
        Relationships: [];
      };
      partner_hubs: {
        Row: PartnerHubRow;
        Insert: Partial<PartnerHubRow> & { name: string };
        Update: Partial<PartnerHubRow>;
        Relationships: [];
      };
      onboarding_agents: {
        Row: OnboardingAgentRow;
        Insert: Partial<OnboardingAgentRow> & { id: string };
        Update: Partial<OnboardingAgentRow>;
        Relationships: [];
      };
      assistance_requests: {
        Row: AssistanceRequestRow;
        Insert: Partial<AssistanceRequestRow>;
        Update: Partial<AssistanceRequestRow>;
        Relationships: [];
      };
      assistance_sessions: {
        Row: AssistanceSessionRow;
        Insert: Partial<AssistanceSessionRow> & { agent_id: string; user_id: string; expires_at: string };
        Update: Partial<AssistanceSessionRow>;
        Relationships: [];
      };
      assisted_field_changes: {
        Row: AssistedFieldChangeRow;
        Insert: Partial<AssistedFieldChangeRow> & {
          session_id: string;
          field_table: string;
          field_name: string;
        };
        Update: Partial<AssistedFieldChangeRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
