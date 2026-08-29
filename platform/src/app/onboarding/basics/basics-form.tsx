"use client";

import { useActionState } from "react";
import { saveBasics } from "@/lib/actions/onboarding";
import type { FormState } from "@/lib/actions/auth";
import type { TalentProfileRow } from "@/lib/database.types";
import { SkillsInput } from "@/components/skills-input";

const initialState: FormState = {};

export function BasicsForm({
  honorifics,
  initial,
}: {
  honorifics: { code: string; label: string }[];
  initial: TalentProfileRow | null | undefined;
}) {
  const [state, formAction, pending] = useActionState(saveBasics, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label htmlFor="honorific" className="text-sm font-semibold text-midnight">
            Honorific
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
            Legal name
          </label>
          <input
            id="legalName"
            name="legalName"
            defaultValue={initial?.legal_name ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {state.errors?.legalName && <p className="mt-1 text-sm text-coral-ink">{state.errors.legalName[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="displayName" className="text-sm font-semibold text-midnight">
          Display name <span className="font-normal text-slate">(shown publicly)</span>
        </label>
        <input
          id="displayName"
          name="displayName"
          defaultValue={initial?.display_name ?? ""}
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.displayName && <p className="mt-1 text-sm text-coral-ink">{state.errors.displayName[0]}</p>}
      </div>

      <div>
        <label htmlFor="headline" className="text-sm font-semibold text-midnight">
          Professional headline
        </label>
        <input
          id="headline"
          name="headline"
          placeholder="e.g. Graphic designer, Web developer, Translator"
          defaultValue={initial?.headline ?? ""}
          required
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.headline && <p className="mt-1 text-sm text-coral-ink">{state.errors.headline[0]}</p>}
      </div>

      <div>
        <label htmlFor="bio" className="text-sm font-semibold text-midnight">
          Short bio
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
            Location
          </label>
          <input
            id="location"
            name="location"
            defaultValue={initial?.location ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
          {state.errors?.location && <p className="mt-1 text-sm text-coral-ink">{state.errors.location[0]}</p>}
        </div>
        <div>
          <label htmlFor="category" className="text-sm font-semibold text-midnight">
            Category
          </label>
          <select
            id="category"
            name="category"
            defaultValue={initial?.category ?? ""}
            required
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="">Select one</option>
            <option value="creative_media">Creative &amp; media</option>
            <option value="digital_technology">Digital &amp; technology</option>
            <option value="business_project_support">Business &amp; project support</option>
          </select>
          {state.errors?.category && <p className="mt-1 text-sm text-coral-ink">{state.errors.category[0]}</p>}
        </div>
      </div>

      <div>
        <label htmlFor="skills" className="text-sm font-semibold text-midnight">
          Skills <span className="font-normal text-slate">(comma-separated)</span>
        </label>
        <SkillsInput
          id="skills"
          name="skills"
          defaultValue={initial?.skills?.join(", ") ?? ""}
          required
          placeholder="e.g. Figma, brand identity, illustration"
        />
        {state.errors?.skills && <p className="mt-1 text-sm text-coral-ink">{state.errors.skills[0]}</p>}
      </div>

      <div>
        <label htmlFor="languages" className="text-sm font-semibold text-midnight">
          Languages <span className="font-normal text-slate">(comma-separated)</span>
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
            Work mode
          </label>
          <select
            id="workMode"
            name="workMode"
            defaultValue={initial?.work_mode ?? "any"}
            className="mt-1 w-full rounded-lg border border-slate/25 px-2 py-2 text-sm"
          >
            <option value="remote">Remote</option>
            <option value="on_site">On-site</option>
            <option value="hybrid">Hybrid</option>
            <option value="any">Any</option>
          </select>
        </div>
        <div>
          <label htmlFor="availability" className="text-sm font-semibold text-midnight">
            Availability
          </label>
          <input
            id="availability"
            name="availability"
            placeholder="e.g. immediately"
            defaultValue={initial?.availability ?? ""}
            className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {state.message && <p className="text-sm text-coral-ink">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-teal px-4 py-2.5 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save and continue"}
      </button>
    </form>
  );
}
