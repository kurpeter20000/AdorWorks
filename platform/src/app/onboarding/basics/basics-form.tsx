"use client";

import { useActionState } from "react";
import { saveBasics } from "@/lib/actions/onboarding";
import type { FormState } from "@/lib/actions/auth";
import type { TalentProfileRow } from "@/lib/database.types";
import { SkillsInput } from "@/components/skills-input";
import { ProfessionInput } from "@/components/profession-input";
import { PROFESSION_SUGGESTIONS } from "@/lib/skills";
import { useT } from "@/i18n/client";

const initialState: FormState = {};

export function BasicsForm({
  honorifics,
  initial,
}: {
  honorifics: { code: string; label: string }[];
  initial: TalentProfileRow | null | undefined;
}) {
  const [state, formAction, pending] = useActionState(saveBasics, initialState);
  const t = useT();
  const err = (e?: string[]) => (e?.[0] ? t(e[0]) : null);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="honorific" className="text-sm font-semibold text-midnight">
            {t("Honorific")}
          </label>
          <select
            id="honorific"
            name="honorific"
            defaultValue={initial?.honorific ?? ""}
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="">—</option>
            {honorifics.map((h) => (
              <option key={h.code} value={h.code}>
                {h.label}
              </option>
            ))}
          </select>
        </div>
        <div className="sm:col-span-2">
          <label htmlFor="legalName" className="text-sm font-semibold text-midnight">
            {t("Legal name")}
          </label>
          <input
            id="legalName"
            name="legalName"
            defaultValue={initial?.legal_name ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {state.errors?.legalName && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.legalName)}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="displayName" className="text-sm font-semibold text-midnight">
          {t("Display name")} <span className="font-normal text-slate">({t("shown publicly")})</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={initial?.display_name ?? ""}
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.displayName && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.displayName)}</p>}
      </div>

      <div>
        <label htmlFor="headline" className="text-sm font-semibold text-midnight">
          {t("Professional headline")}
        </label>
        <ProfessionInput
          id="headline"
          name="headline"
          placeholder={t("e.g. Graphic designer, Web developer, Translator")}
          defaultValue={initial?.headline ?? ""}
          required
          suggestions={PROFESSION_SUGGESTIONS}
        />
        {state.errors?.headline && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.headline)}</p>}
      </div>

      <div>
        <label htmlFor="bio" className="text-sm font-semibold text-midnight">
          {t("Short bio")}
        </label>
        <textarea
          id="bio"
          name="bio"
          rows={3}
          defaultValue={initial?.bio ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="location" className="text-sm font-semibold text-midnight">
            {t("Location")}
          </label>
          <input
            id="location"
            name="location"
            defaultValue={initial?.location ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {state.errors?.location && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.location)}</p>}
        </div>
        <div>
          <label htmlFor="category" className="text-sm font-semibold text-midnight">
            {t("Category")}
          </label>
          <select
            id="category"
            name="category"
            defaultValue={initial?.category ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="">{t("Select one")}</option>
            <option value="creative_media">{t("Creative & media")}</option>
            <option value="digital_technology">{t("Digital & technology")}</option>
            <option value="business_project_support">{t("Business & project support")}</option>
          </select>
          {state.errors?.category && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.category)}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="skills" className="text-sm font-semibold text-midnight">
          {t("Skills")} <span className="font-normal text-slate">({t("comma-separated")})</span>
        </label>
        <SkillsInput
          id="skills"
          name="skills"
          defaultValue={initial?.skills?.join(", ") ?? ""}
          required
          placeholder={t("e.g. Figma, brand identity, illustration")}
        />
        {state.errors?.skills && <p className="mt-1 text-sm text-coral-ink">{err(state.errors.skills)}</p>}
      </div>

      <div>
        <label htmlFor="languages" className="text-sm font-semibold text-midnight">
          {t("Languages")} <span className="font-normal text-slate">({t("comma-separated")})</span>
        </label>
        <input
          id="languages"
          name="languages"
          defaultValue={initial?.languages?.join(", ") ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="workMode" className="text-sm font-semibold text-midnight">
            {t("Work mode")}
          </label>
          <select
            id="workMode"
            name="workMode"
            defaultValue={initial?.work_mode ?? "any"}
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="remote">{t("Remote")}</option>
            <option value="on_site">{t("On-site")}</option>
            <option value="hybrid">{t("Hybrid")}</option>
            <option value="any">{t("Any")}</option>
          </select>
        </div>
        <div>
          <label htmlFor="availability" className="text-sm font-semibold text-midnight">
            {t("Availability")}
          </label>
          <input
            id="availability"
            name="availability"
            placeholder={t("e.g. immediately")}
            defaultValue={initial?.availability ?? ""}
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label htmlFor="preferredEngagementType" className="text-sm font-semibold text-midnight">
          {t("Preferred work type")}
        </label>
        <select
          id="preferredEngagementType"
          name="preferredEngagementType"
          defaultValue={initial?.preferred_engagement_type ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
        >
          <option value="">{t("No preference")}</option>
          <option value="full_time">{t("Full-time")}</option>
          <option value="freelance_contract">{t("Freelancing/Contract")}</option>
        </select>
        <p className="mt-1 text-xs text-slate">{t("Used to prioritize matching opportunities in Find work.")}</p>
      </div>

      {state.message && <p className="text-sm text-coral-ink" role="alert">{t(state.message)}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? t("Saving…") : t("Save and continue")}
      </button>
    </form>
  );
}
