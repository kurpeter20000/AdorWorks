-- Packaged professional services — a staff-curated catalog matching the
-- real service list on the marketing site (services.html), so an employer
-- posting a 'service'-type opportunity can start from a defined package
-- instead of writing a brief from scratch. Deliberately reuses the
-- existing opportunity pipeline (post -> pending_review -> staff approve)
-- rather than a separate booking system.

create table if not exists service_packages (
  id uuid primary key default gen_random_uuid(),
  category category not null,
  title text not null,
  deliverable text not null,
  inputs_needed text,
  excludes text,
  typical_timeframe text,
  active boolean not null default true,
  sequence int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists service_packages_category_idx on service_packages(category);
create unique index if not exists service_packages_category_title_uidx on service_packages(category, title);

alter table opportunities add column if not exists service_package_id uuid references service_packages(id) on delete set null;

alter table service_packages enable row level security;
drop policy if exists service_packages_select on service_packages;
create policy service_packages_select on service_packages for select
  using (active or is_staff());
drop policy if exists service_packages_write on service_packages;
create policy service_packages_write on service_packages for all
  using (is_staff()) with check (is_staff());

insert into service_packages (category, title, deliverable, inputs_needed, excludes, typical_timeframe, sequence) values
  ('creative_media', 'Brand & graphic design', 'Logo, brand mark, social templates or print-ready collateral.', 'Brand brief, references, existing assets.', 'Full brand strategy (see AdorWorks'' sister company, Adormedia).', 'Confirmed per scope.', 1),
  ('creative_media', 'Photography & video production', 'A shoot day plus edited assets to an agreed spec.', 'Shot list, location access, usage rights terms.', 'Equipment insurance and location permits (client''s responsibility unless separately agreed).', 'Confirmed per scope.', 2),
  ('creative_media', 'Editing & animation', 'Edited video, motion graphics or animated explainer to spec.', 'Raw footage or brief, reference examples.', 'Original filming (pair with photography & video production).', 'Confirmed per scope.', 3),
  ('creative_media', 'Content creation & copywriting', 'Written or social content to an agreed brief and word count.', 'Tone-of-voice guidance, key messages, examples.', 'Translation into additional languages (request separately).', 'Confirmed per scope.', 4),
  ('digital_technology', 'Web development', 'A working website or web application to an agreed specification.', 'Content, brand assets, hosting access.', 'Ongoing maintenance unless a retainer is agreed separately.', 'Confirmed per scope.', 1),
  ('digital_technology', 'Data support & analytics', 'Cleaned datasets, dashboards or an analysis report.', 'Raw data, access credentials, the decision the analysis should inform.', 'Data collection in the field (pair with business & project support).', 'Confirmed per scope.', 2),
  ('digital_technology', 'Digital advertising', 'A set-up and managed ad campaign against an agreed objective and budget.', 'Ad spend budget, platform access, creative assets or a design request.', 'Ad spend itself, which is billed separately to the platform.', 'Confirmed per scope.', 3),
  ('digital_technology', 'IT & software support', 'A scoped fix, integration or small software build.', 'System access, a clear problem statement.', 'Hardware procurement.', 'Confirmed per scope.', 4),
  ('business_project_support', 'Virtual assistance & bookkeeping', 'Ongoing administrative or bookkeeping support against an agreed weekly scope.', 'System access, task list, reporting cadence.', 'Statutory tax filing (refer to a licensed accountant).', 'Ongoing, reviewed monthly.', 1),
  ('business_project_support', 'Research & enumeration', 'A completed research report or field data-collection exercise.', 'Research questions or a survey instrument, target sample, field access.', 'Ethical review/IRB approval, which remains the client''s responsibility.', 'Confirmed per scope.', 2),
  ('business_project_support', 'Transcription & translation', 'Transcribed or translated documents/audio to an agreed word or minute count.', 'Source files, target language(s), any glossary or terminology guide.', 'Certified/notarised translation unless separately agreed.', 'Confirmed per scope.', 3),
  ('business_project_support', 'Project administration', 'Coordination support for an existing project — scheduling, reporting, vendor liaison.', 'Project plan, stakeholder list, reporting templates.', 'Project ownership/sign-off authority, which stays with the client.', 'Ongoing, reviewed monthly.', 4)
on conflict (category, title) do nothing;
