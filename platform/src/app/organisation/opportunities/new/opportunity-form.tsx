"use client";

import { useActionState, useRef, useState } from "react";
import { createOpportunity, resubmitOpportunity } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";
import type { OpportunityRow, ServicePackageRow } from "@/lib/database.types";
import { SkillsInput } from "@/components/skills-input";
import { ENGAGEMENT_TYPE_LABEL, PAYMENT_BASIS_LABEL, WORK_MODE_LABEL } from "@/lib/domain/taxonomy";

const initialState: FormState = {};

let nextQuestionKey = 0;

const CATEGORY_LABEL: Record<string, string> = {
  creative_media: "Creative & media",
  digital_technology: "Digital & technology",
  business_project_support: "Business & project support",
};

/**
 * Role Canvas — Stage 3 wizard treatment of what was a single long form.
 * All fields stay mounted in one <form> the whole time (so values survive
 * moving between steps); each step is just shown/hidden via the `hidden`
 * attribute, which also has the side effect of exempting a hidden step's
 * `required` fields from the browser's native validation. That's why a
 * failed submission jumps back to the first step with a server-side error
 * (see the effect below) rather than relying on native validation to
 * catch it — by the time you can click Submit, only the Review step's
 * own fields (there are none) would be checked.
 */
const STEPS = ["Basics", "Details", "Compensation", "Screening & shortlisting", "Review"] as const;

const FIELD_STEP: Record<string, number> = {
  title: 0,
  category: 0,
  skills: 1,
  engagementType: 1,
  compensationAmount: 2,
};

interface PreviewSnapshot {
  title: string;
  category: string;
  brief: string;
  skills: string;
  location: string;
  workMode: string;
  engagementType: string;
  paymentBasis: string;
  compensationAmount: string;
  compensationMin: string;
  compensationMax: string;
  currency: string;
}

function readSnapshot(form: HTMLFormElement): PreviewSnapshot {
  const fd = new FormData(form);
  const get = (name: string) => String(fd.get(name) ?? "");
  return {
    title: get("title"),
    category: get("category"),
    brief: get("brief"),
    skills: get("skills"),
    location: get("location"),
    workMode: get("workMode"),
    engagementType: get("engagementType"),
    paymentBasis: get("paymentBasis"),
    compensationAmount: get("compensationAmount"),
    compensationMin: get("compensationMin"),
    compensationMax: get("compensationMax"),
    currency: get("currency"),
  };
}

function formatPreviewCompensation(p: PreviewSnapshot) {
  const currency = p.currency || "SSP";
  if (p.compensationAmount) return `${currency} ${Number(p.compensationAmount).toLocaleString()}`;
  if (p.compensationMin && p.compensationMax) {
    return `${currency} ${Number(p.compensationMin).toLocaleString()}–${Number(p.compensationMax).toLocaleString()}`;
  }
  if (p.paymentBasis === "negotiable") return "Negotiable";
  return "Paid — details on application";
}

export function OpportunityForm({
  organisationId,
  servicePackages,
  opportunity,
  existingScreeningQuestions,
}: {
  organisationId: string;
  servicePackages: Pick<ServicePackageRow, "id" | "category" | "title" | "deliverable" | "inputs_needed" | "excludes">[];
  /** When set, the form edits and resubmits this opportunity instead of creating a new one. */
  opportunity?: OpportunityRow;
  existingScreeningQuestions?: { text: string; required: boolean }[];
}) {
  const boundAction = opportunity
    ? resubmitOpportunity.bind(null, opportunity.id)
    : createOpportunity.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);
  const [questions, setQuestions] = useState<{ key: number; text: string; required: boolean }[]>(
    () => (existingScreeningQuestions ?? []).map((q) => ({ key: nextQuestionKey++, ...q }))
  );
  const [type, setType] = useState<string>(opportunity?.type ?? "project");
  const [servicePackageId, setServicePackageId] = useState(opportunity?.service_package_id ?? "");
  const [step, setStep] = useState(0);
  const [preview, setPreview] = useState<PreviewSnapshot | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const briefRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLSelectElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  function goNext() {
    const next = step + 1;
    if (next === STEPS.length - 1 && formRef.current) {
      setPreview(readSnapshot(formRef.current));
    }
    setStep(next);
  }

  // Jump back to whichever step has the error, the moment a new failed
  // submission result arrives — done during render (not an effect) per
  // React's "adjusting state when a prop changes" pattern, guarded by
  // comparing against the last state object seen so it only fires once
  // per submission, not on every render.
  const [handledState, setHandledState] = useState(state);
  if (state !== handledState) {
    setHandledState(state);
    const erroredField = Object.keys(FIELD_STEP).find((f) => state.errors?.[f]);
    if (erroredField !== undefined) setStep(FIELD_STEP[erroredField]);
  }

  function applyServicePackage(id: string) {
    setServicePackageId(id);
    const pkg = servicePackages.find((p) => p.id === id);
    if (!pkg) return;
    if (titleRef.current) titleRef.current.value = pkg.title;
    if (categoryRef.current) categoryRef.current.value = pkg.category;
    if (briefRef.current) {
      briefRef.current.value = [
        `Deliverable: ${pkg.deliverable}`,
        pkg.inputs_needed ? `Inputs needed: ${pkg.inputs_needed}` : null,
        pkg.excludes ? `Excludes: ${pkg.excludes}` : null,
      ]
        .filter(Boolean)
        .join("\n");
    }
  }

  const packagesByCategory = servicePackages.reduce<Record<string, typeof servicePackages>>((acc, p) => {
    (acc[p.category] ??= []).push(p);
    return acc;
  }, {});

  function addQuestion() {
    setQuestions((qs) => [...qs, { key: nextQuestionKey++, text: "", required: false }]);
  }
  function updateQuestion(key: number, patch: Partial<{ text: string; required: boolean }>) {
    setQuestions((qs) => qs.map((q) => (q.key === key ? { ...q, ...patch } : q)));
  }
  function removeQuestion(key: number) {
    setQuestions((qs) => qs.filter((q) => q.key !== key));
  }

  const erroredFields = Object.keys(FIELD_STEP).filter((f) => state.errors?.[f]);

  return (
    <form ref={formRef} action={formAction} className="mt-6 space-y-4">
      <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-slate">
        {STEPS.map((label, i) => (
          <li key={label} className={i === step ? "text-violet" : undefined}>
            {i + 1}. {label}
          </li>
        ))}
      </ol>

      <div hidden={step !== 0} className="space-y-4">
        <div>
          <label htmlFor="title" className="text-sm font-semibold text-midnight">
            Title
          </label>
          <input
            id="title"
            name="title"
            ref={titleRef}
            required
            defaultValue={opportunity?.title}
            placeholder="e.g. Graphic designer for a 2-month brand refresh"
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {state.errors?.title && <p className="mt-1 text-sm text-coral">{state.errors.title[0]}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="type" className="text-sm font-semibold text-midnight">
              Type
            </label>
            <select
              id="type"
              name="type"
              required
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
            >
              <option value="project">Project</option>
              <option value="service">Service</option>
              <option value="contract">Contract</option>
              <option value="full_time">Full-time role</option>
              <option value="squad">Squad / team</option>
            </select>
          </div>
          <div>
            <label htmlFor="category" className="text-sm font-semibold text-midnight">
              Category
            </label>
            <select
              id="category"
              name="category"
              ref={categoryRef}
              required
              defaultValue={opportunity?.category ?? undefined}
              className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
            >
              <option value="creative_media">Creative &amp; media</option>
              <option value="digital_technology">Digital &amp; technology</option>
              <option value="business_project_support">Business &amp; project support</option>
            </select>
            {state.errors?.category && <p className="mt-1 text-sm text-coral">{state.errors.category[0]}</p>}
          </div>
        </div>

        {type === "service" && servicePackages.length > 0 && (
          <div className="rounded-xl border border-slate/15 bg-cloud p-4">
            <label htmlFor="servicePackage" className="text-sm font-semibold text-midnight">
              Start from a packaged service <span className="font-normal text-slate">(optional)</span>
            </label>
            <p className="mt-1 text-xs text-slate">
              Picks a defined, quality-controlled deliverable and fills in the title, category and brief below —
              you can still edit everything before submitting.
            </p>
            <select
              id="servicePackage"
              value={servicePackageId}
              onChange={(e) => applyServicePackage(e.target.value)}
              className="mt-2 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
            >
              <option value="">Write my own brief</option>
              {Object.entries(packagesByCategory).map(([category, pkgs]) => (
                <optgroup key={category} label={CATEGORY_LABEL[category] ?? category}>
                  {pkgs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.title}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
            <input type="hidden" name="servicePackageId" value={servicePackageId} />
          </div>
        )}
      </div>

      <div hidden={step !== 1} className="space-y-4">
        <div>
          <label htmlFor="brief" className="text-sm font-semibold text-midnight">
            Brief
          </label>
          <textarea
            id="brief"
            name="brief"
            ref={briefRef}
            rows={4}
            defaultValue={opportunity?.brief ?? undefined}
            placeholder="What needs doing, the outcome you want, anything a good applicant should know."
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label htmlFor="skills" className="text-sm font-semibold text-midnight">
            Required skills <span className="font-normal text-slate">(comma-separated)</span>
          </label>
          <SkillsInput
            id="skills"
            name="skills"
            required
            defaultValue={opportunity?.skills?.join(", ")}
            placeholder="e.g. Figma, brand identity, illustration"
          />
          {state.errors?.skills && <p className="mt-1 text-sm text-coral">{state.errors.skills[0]}</p>}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="location" className="text-sm font-semibold text-midnight">
              Location <span className="font-normal text-slate">(optional)</span>
            </label>
            <input
              id="location"
              name="location"
              defaultValue={opportunity?.location ?? undefined}
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="workMode" className="text-sm font-semibold text-midnight">
              Work mode
            </label>
            <select
              id="workMode"
              name="workMode"
              className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
              defaultValue={opportunity?.work_mode ?? "any"}
            >
              <option value="remote">Remote</option>
              <option value="on_site">On-site</option>
              <option value="hybrid">Hybrid</option>
              <option value="any">Any</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="engagementType" className="text-sm font-semibold text-midnight">
            Engagement type
          </label>
          <select
            id="engagementType"
            name="engagementType"
            required
            defaultValue={opportunity?.engagement_type ?? undefined}
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="freelance">Freelance</option>
            <option value="fixed_term_contract">Fixed-term contract</option>
            <option value="full_time">Full-time</option>
            <option value="internship">Internship</option>
            <option value="apprenticeship">Apprenticeship</option>
            <option value="managed_service">Managed service</option>
          </select>
          {state.errors?.engagementType && (
            <p className="mt-1 text-sm text-coral">{state.errors.engagementType[0]}</p>
          )}
        </div>
      </div>

      <div hidden={step !== 2} className="space-y-4">
        <div className="rounded-xl border border-slate/15 bg-cloud p-4">
          <p className="text-sm font-semibold text-midnight">Compensation</p>
          <p className="mt-1 text-xs text-slate">
            AdorWorks only lists paid opportunities. Enter a fixed amount, or a range.
          </p>
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div>
              <label htmlFor="paymentBasis" className="text-xs font-semibold text-midnight">
                Paid
              </label>
              <select
                id="paymentBasis"
                name="paymentBasis"
                required
                defaultValue={opportunity?.payment_basis ?? undefined}
                className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
              >
                <option value="fixed">Fixed price</option>
                <option value="milestone">Per milestone</option>
                <option value="hourly">Hourly</option>
                <option value="daily">Daily</option>
                <option value="monthly">Monthly</option>
                <option value="negotiable">Negotiable</option>
              </select>
            </div>
            <div>
              <label htmlFor="currency" className="text-xs font-semibold text-midnight">
                Currency
              </label>
              <input
                id="currency"
                name="currency"
                defaultValue={opportunity?.currency ?? "SSP"}
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="compensationAmount" className="text-xs font-semibold text-midnight">
                Amount
              </label>
              <input
                id="compensationAmount"
                name="compensationAmount"
                type="number"
                min="0"
                step="0.01"
                defaultValue={opportunity?.compensation_amount ?? undefined}
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="compensationMin" className="text-xs font-semibold text-midnight">
                Or min
              </label>
              <input
                id="compensationMin"
                name="compensationMin"
                type="number"
                min="0"
                step="0.01"
                defaultValue={opportunity?.compensation_min ?? undefined}
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label htmlFor="compensationMax" className="text-xs font-semibold text-midnight">
                Max
              </label>
              <input
                id="compensationMax"
                name="compensationMax"
                type="number"
                min="0"
                step="0.01"
                defaultValue={opportunity?.compensation_max ?? undefined}
                className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
              />
            </div>
          </div>
          {state.errors?.compensationAmount && (
            <p className="mt-2 text-sm text-coral">{state.errors.compensationAmount[0]}</p>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label htmlFor="applicationDeadline" className="text-sm font-semibold text-midnight">
              Apply by <span className="font-normal text-slate">(optional)</span>
            </label>
            <input
              id="applicationDeadline"
              name="applicationDeadline"
              type="date"
              defaultValue={opportunity?.application_deadline ?? undefined}
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="numberOfOpenings" className="text-sm font-semibold text-midnight">
              Number of openings
            </label>
            <input
              id="numberOfOpenings"
              name="numberOfOpenings"
              type="number"
              min="1"
              defaultValue={opportunity?.number_of_openings ?? 1}
              className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
            />
          </div>
        </div>
      </div>

      <div hidden={step !== 3} className="space-y-4">
        <div className="rounded-xl border border-slate/15 bg-cloud p-4">
          <p className="text-sm font-semibold text-midnight">
            Screening questions <span className="font-normal text-slate">(optional)</span>
          </p>
          <p className="mt-1 text-xs text-slate">
            Ask applicants to answer these when they apply — useful for filtering fit before you review pitches.
          </p>

          <div className="mt-3 space-y-3">
            {questions.map((q) => (
              <div key={q.key} className="flex items-start gap-2">
                <input
                  value={q.text}
                  onChange={(e) => updateQuestion(q.key, { text: e.target.value })}
                  placeholder="e.g. Have you managed a brand refresh before?"
                  className="flex-1 rounded-lg border border-slate/25 px-3 py-2 text-sm"
                />
                <label className="mt-2 flex items-center gap-1 whitespace-nowrap text-xs text-midnight">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => updateQuestion(q.key, { required: e.target.checked })}
                  />
                  Required
                </label>
                <button
                  type="button"
                  onClick={() => removeQuestion(q.key)}
                  className="mt-1 text-xs font-semibold text-coral"
                >
                  Remove
                </button>
              </div>
            ))}
          </div>

          <button type="button" onClick={addQuestion} className="mt-3 text-xs font-semibold text-teal-ink underline">
            + Add a screening question
          </button>

          <input
            type="hidden"
            name="screeningQuestions"
            value={JSON.stringify(questions.filter((q) => q.text.trim()).map((q) => ({ text: q.text.trim(), required: q.required })))}
          />
        </div>

        <div className="rounded-xl border border-slate/15 bg-cloud p-4">
          <p className="text-sm font-semibold text-midnight">Who shortlists applicants?</p>
          <p className="mt-1 text-xs text-slate">
            You can change your mind later from the opportunity&rsquo;s page.
          </p>
          <div className="mt-3 space-y-2">
            <label className="flex items-start gap-2 text-sm text-midnight">
              <input
                type="radio"
                name="shortlistingMode"
                value="staff_assisted"
                defaultChecked={(opportunity?.shortlisting_mode ?? "staff_assisted") === "staff_assisted"}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">AdorWorks staff shortlist for me</span>
                <span className="block text-xs text-slate">
                  You&rsquo;ll only see applicants once staff have reviewed and shortlisted them — same as today.
                </span>
              </span>
            </label>
            <label className="flex items-start gap-2 text-sm text-midnight">
              <input
                type="radio"
                name="shortlistingMode"
                value="self_service"
                defaultChecked={opportunity?.shortlisting_mode === "self_service"}
                className="mt-1"
              />
              <span>
                <span className="font-semibold">I&rsquo;ll shortlist myself</span>
                <span className="block text-xs text-slate">
                  See every applicant as they apply and shortlist or pass on them yourself.
                </span>
              </span>
            </label>
          </div>
        </div>
      </div>

      <div hidden={step !== 4} className="space-y-4">
        <p className="text-sm text-slate">
          Use Back to review any step. Submitting sends this {opportunity ? "back to" : "to"} AdorWorks staff for
          review.
        </p>
        {preview && (
          <div className="rounded-xl border border-slate/15 bg-white p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate">
              Preview — roughly how this will look to talent
            </p>
            <div className="mt-2 flex items-start justify-between gap-4">
              <p className="font-bold text-midnight">{preview.title || "(untitled)"}</p>
              <span className="whitespace-nowrap text-sm font-semibold text-teal-ink">
                {formatPreviewCompensation(preview)}
              </span>
            </div>
            {preview.brief && <p className="mt-2 line-clamp-3 text-sm text-slate">{preview.brief}</p>}
            {preview.skills && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {preview.skills
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .slice(0, 6)
                  .map((s) => (
                    <span key={s} className="rounded-full bg-cloud px-2.5 py-1 text-xs text-slate">
                      {s}
                    </span>
                  ))}
              </div>
            )}
            <p className="mt-3 text-xs text-slate">
              {[
                CATEGORY_LABEL[preview.category] ?? preview.category,
                preview.location,
                WORK_MODE_LABEL[preview.workMode as keyof typeof WORK_MODE_LABEL],
                ENGAGEMENT_TYPE_LABEL[preview.engagementType as keyof typeof ENGAGEMENT_TYPE_LABEL],
                PAYMENT_BASIS_LABEL[preview.paymentBasis as keyof typeof PAYMENT_BASIS_LABEL],
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        )}
        {erroredFields.length > 0 && (
          <div className="rounded-lg bg-coral/10 px-4 py-3 text-sm text-coral">
            <p className="font-semibold">Fix these before submitting:</p>
            <ul className="mt-1 space-y-1">
              {erroredFields.map((f) => (
                <li key={f}>
                  <button type="button" onClick={() => setStep(FIELD_STEP[f])} className="underline">
                    {state.errors?.[f]?.[0]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {state.message && <p className="text-sm text-coral">{state.message}</p>}
      </div>

      <div className="flex items-center justify-between gap-3 pt-2">
        {step > 0 ? (
          <button
            type="button"
            onClick={() => setStep((s) => s - 1)}
            className="rounded-lg border border-slate/25 px-4 py-2 text-sm font-semibold text-midnight"
          >
            Back
          </button>
        ) : (
          <span />
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" onClick={goNext} className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white">
            Next: {STEPS[step + 1]}
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
            className="rounded-lg bg-violet px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {pending ? "Submitting…" : opportunity ? "Save & resubmit for review" : "Submit for review"}
          </button>
        )}
      </div>
    </form>
  );
}
