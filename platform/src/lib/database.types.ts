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
export type OpportunityStatus = "draft" | "pending_review" | "open" | "filled" | "closed" | "cancelled" | "rejected" | "changes_required" | "paused" | "expired";
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
  avatar_path: string | null;
  readiness: Record<string, unknown>;
  verification_tier: VerificationTier;
  public_visible: boolean;
  safety_orientation_completed_at: string | null;
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
  logo_path: string | null;
  representative_id: string;
  billing_email: string | null;
  verification_status: "pending" | "verified" | "rejected" | "suspended";
  risk_notes: string | null;
  created_at: string;
  updated_at: string;
}

export type OrganisationMemberRole = "member" | "admin" | "recruiter" | "hiring_manager" | "finance" | "viewer";

export type OrganisationMemberRow = {
  id: string;
  organisation_id: string;
  user_id: string;
  role: OrganisationMemberRole;
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
  rejection_reason: string | null;
  status_note: string | null;
  appeal_note: string | null;
  appealed_at: string | null;
  service_package_id: string | null;
  shortlisting_mode: "self_service" | "staff_assisted";
  created_at: string;
  updated_at: string;
}

export type ServicePackageRow = {
  id: string;
  category: Category;
  title: string;
  deliverable: string;
  inputs_needed: string | null;
  excludes: string | null;
  typical_timeframe: string | null;
  active: boolean;
  sequence: number;
  created_at: string;
}

export type TalentServiceStatus = "draft" | "pending_review" | "published" | "paused" | "rejected" | "removed";

export type TalentServiceRow = {
  id: string;
  talent_id: string;
  title: string;
  category: Category | null;
  problem_solved: string | null;
  deliverables: string | null;
  exclusions: string | null;
  payment_basis: PaymentBasis | null;
  price: number | null;
  currency: string | null;
  turnaround: string | null;
  status: TalentServiceStatus;
  status_note: string | null;
  published_at: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ApplicationRow = {
  id: string;
  opportunity_id: string;
  talent_id: string;
  source: "applied" | "matched" | "invited";
  pitch: string | null;
  suitability_score: number | null;
  notes: string | null;
  stage: ApplicationStage;
  decision_reason: string | null;
  interview_scheduled_at: string | null;
  interview_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export type InvitationStatus = "pending" | "accepted" | "declined" | "expired";

export type InvitationRow = {
  id: string;
  opportunity_id: string;
  talent_id: string;
  invited_by: string;
  message: string | null;
  status: InvitationStatus;
  responded_at: string | null;
  created_at: string;
}

export type ApplicationScorecardRow = {
  id: string;
  application_id: string;
  criterion: "skill_fit" | "communication" | "portfolio_quality" | "reliability";
  score: number;
  note: string | null;
  scored_by: string;
  created_at: string;
  updated_at: string;
}

export type ApplicationNoteRow = {
  id: string;
  application_id: string;
  author_id: string;
  body: string;
  created_at: string;
}

export type ScreeningQuestionRow = {
  id: string;
  opportunity_id: string;
  question: string;
  required: boolean;
  sequence: number;
  created_at: string;
}

export type ScreeningAnswerRow = {
  id: string;
  application_id: string;
  screening_question_id: string;
  answer: string;
  created_at: string;
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
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancellation_reason: string | null;
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

export type TimesheetStatus = "submitted" | "approved" | "rejected";

export type TimesheetRow = {
  id: string;
  contract_id: string;
  period_start: string;
  period_end: string;
  hours: number;
  status: TimesheetStatus;
  created_at: string;
}

export type DisputeStatus = "open" | "investigating" | "resolved" | "escalated";

export type DisputeRow = {
  id: string;
  engagement_id: string | null;
  contract_id: string | null;
  raised_by: string;
  description: string;
  status: DisputeStatus;
  resolution: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export type PaymentEventRow = {
  id: string;
  milestone_id: string | null;
  contract_id: string;
  intention_id: string | null;
  invoice_id: string | null;
  provider_name: string;
  external_reference: string;
  payer_phone: string | null;
  card_last4: string | null;
  card_brand: string | null;
  receipt_number: string | null;
  amount: number;
  currency: string;
  status: PaymentEventStatus;
  is_simulated: boolean;
  created_at: string;
}

export type PaymentIntentionStatus = "processing" | "succeeded" | "failed";

export type PaymentIntentionRow = {
  id: string;
  contract_id: string;
  milestone_id: string;
  invoice_id: string | null;
  provider: "mgurush" | "mtn_momo" | "visa_mastercard";
  payer_phone: string | null;
  card_last4: string | null;
  card_brand: string | null;
  amount: number;
  currency: string;
  status: PaymentIntentionStatus;
  failure_reason: string | null;
  created_by: string;
  created_at: string;
  resolved_at: string | null;
}

export type FinanceRecordType = "deposit" | "invoice" | "fee" | "payout" | "refund";
export type FinanceRecordStatus = "pending" | "confirmed" | "reconciled" | "cancelled";

export type FinanceRecordRow = {
  id: string;
  engagement_id: string | null;
  contract_id: string | null;
  milestone_id: string | null;
  record_type: FinanceRecordType;
  amount: number;
  currency: string;
  status: FinanceRecordStatus;
  exchange_rate_basis: string | null;
  notes: string | null;
  recorded_by: string;
  created_at: string;
  updated_at: string;
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
  file_path: string | null;
  file_name: string | null;
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

export type SavedOpportunityRow = {
  talent_id: string;
  opportunity_id: string;
  created_at: string;
}

export type DismissedOpportunityRow = {
  talent_id: string;
  opportunity_id: string;
  created_at: string;
}

export type SavedServiceRow = {
  saver_id: string;
  service_id: string;
  created_at: string;
}

export type DismissedServiceRow = {
  saver_id: string;
  service_id: string;
  created_at: string;
}

export type ReportTargetType = "opportunity" | "talent_service" | "talent_profile" | "organisation";
export type ReportReason = "spam" | "scam" | "inappropriate" | "misleading" | "other";
export type ReportStatus = "open" | "reviewed" | "dismissed" | "actioned";

export type ReportRow = {
  id: string;
  reporter_id: string;
  target_type: ReportTargetType;
  target_id: string;
  reason: ReportReason;
  note: string | null;
  status: ReportStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
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

export type AssistanceSessionScope = { fields: string[]; freshAccount?: boolean };

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

export type PublicTalentProfileRow = {
  id: string;
  display_name: string | null;
  headline: string | null;
  bio: string | null;
  category: Category | null;
  skills: string[];
  languages: string[];
  location: string | null;
  work_mode: WorkMode | null;
  availability: string | null;
  years_experience: number | null;
  portfolio_url: string | null;
  linkedin_url: string | null;
  github_url: string | null;
  website_url: string | null;
  avatar_path: string | null;
  verification_tier: VerificationTier;
  created_at: string;
}

export type VerificationCheckRow = {
  id: string;
  organisation_id: string;
  check_type: "registration" | "representative";
  status: "not_started" | "information_required" | "submitted" | "under_review" | "verified" | "rejected" | "suspended" | "expired";
  method: "formal_registration" | "alternative_referral" | "physical_review" | "representative_attestation" | null;
  evidence_path: string | null;
  reason: string | null;
  applicant_note: string | null;
  decided_by: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export type AuditEventRow = {
  id: string;
  name: string;
  occurred_at: string;
  actor_id: string | null;
  subject_id: string | null;
  entity_type: string;
  entity_id: string;
  reason: string | null;
  source: "platform" | "staff_api" | "database" | "public_site";
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
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
      service_packages: {
        Row: ServicePackageRow;
        Insert: Partial<ServicePackageRow> & { category: Category; title: string; deliverable: string };
        Update: Partial<ServicePackageRow>;
        Relationships: [];
      };
      talent_services: {
        Row: TalentServiceRow;
        Insert: Partial<TalentServiceRow> & { talent_id: string; title: string };
        Update: Partial<TalentServiceRow>;
        Relationships: [];
      };
      applications: {
        Row: ApplicationRow;
        Insert: Partial<ApplicationRow> & { opportunity_id: string; talent_id: string };
        Update: Partial<ApplicationRow>;
        Relationships: [];
      };
      invitations: {
        Row: InvitationRow;
        Insert: Partial<InvitationRow> & { opportunity_id: string; talent_id: string; invited_by: string };
        Update: Partial<InvitationRow>;
        Relationships: [];
      };
      application_scorecards: {
        Row: ApplicationScorecardRow;
        Insert: Partial<ApplicationScorecardRow> & { application_id: string; criterion: ApplicationScorecardRow["criterion"]; score: number; scored_by: string };
        Update: Partial<ApplicationScorecardRow>;
        Relationships: [];
      };
      application_notes: {
        Row: ApplicationNoteRow;
        Insert: Partial<ApplicationNoteRow> & { application_id: string; author_id: string; body: string };
        Update: Partial<ApplicationNoteRow>;
        Relationships: [];
      };
      screening_questions: {
        Row: ScreeningQuestionRow;
        Insert: Partial<ScreeningQuestionRow> & { opportunity_id: string; question: string };
        Update: Partial<ScreeningQuestionRow>;
        Relationships: [];
      };
      screening_answers: {
        Row: ScreeningAnswerRow;
        Insert: Partial<ScreeningAnswerRow> & {
          application_id: string;
          screening_question_id: string;
          answer: string;
        };
        Update: Partial<ScreeningAnswerRow>;
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
      payment_intentions: {
        Row: PaymentIntentionRow;
        Insert: Partial<PaymentIntentionRow> & {
          contract_id: string;
          milestone_id: string;
          provider: "mgurush" | "mtn_momo" | "visa_mastercard";
          amount: number;
          created_by: string;
        };
        Update: Partial<PaymentIntentionRow>;
        Relationships: [];
      };
      finance_records: {
        Row: FinanceRecordRow;
        Insert: Partial<FinanceRecordRow> & { record_type: FinanceRecordType; amount: number; recorded_by: string };
        Update: Partial<FinanceRecordRow>;
        Relationships: [];
      };
      timesheets: {
        Row: TimesheetRow;
        Insert: Partial<TimesheetRow> & {
          contract_id: string;
          period_start: string;
          period_end: string;
          hours: number;
        };
        Update: Partial<TimesheetRow>;
        Relationships: [];
      };
      disputes: {
        Row: DisputeRow;
        Insert: Partial<DisputeRow> & { raised_by: string; description: string };
        Update: Partial<DisputeRow>;
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
      saved_opportunities: {
        Row: SavedOpportunityRow;
        Insert: Partial<SavedOpportunityRow> & { talent_id: string; opportunity_id: string };
        Update: Partial<SavedOpportunityRow>;
        Relationships: [];
      };
      dismissed_opportunities: {
        Row: DismissedOpportunityRow;
        Insert: Partial<DismissedOpportunityRow> & { talent_id: string; opportunity_id: string };
        Update: Partial<DismissedOpportunityRow>;
        Relationships: [];
      };
      saved_services: {
        Row: SavedServiceRow;
        Insert: Partial<SavedServiceRow> & { saver_id: string; service_id: string };
        Update: Partial<SavedServiceRow>;
        Relationships: [];
      };
      dismissed_services: {
        Row: DismissedServiceRow;
        Insert: Partial<DismissedServiceRow> & { saver_id: string; service_id: string };
        Update: Partial<DismissedServiceRow>;
        Relationships: [];
      };
      reports: {
        Row: ReportRow;
        Insert: Partial<ReportRow> & { reporter_id: string; target_type: ReportTargetType; target_id: string; reason: ReportReason };
        Update: Partial<ReportRow>;
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
      verification_checks: {
        Row: VerificationCheckRow;
        Insert: Partial<VerificationCheckRow> & { organisation_id: string; check_type: VerificationCheckRow["check_type"] };
        Update: Partial<VerificationCheckRow>;
        Relationships: [];
      };
      audit_events: {
        Row: AuditEventRow;
        Insert: Partial<AuditEventRow> & { name: string; entity_type: string; entity_id: string; source: AuditEventRow["source"] };
        Update: Partial<AuditEventRow>;
        Relationships: [];
      };
    };
    Views: {
      public_talent_profiles: {
        Row: PublicTalentProfileRow;
        Relationships: [];
      };
    };
    Functions: Record<string, never>;
  };
}
