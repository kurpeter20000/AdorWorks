"use client";

import { useActionState } from "react";
import { updateProfessionalLinks } from "@/lib/actions/passport";
import type { FormState } from "@/lib/actions/auth";
import type { TalentProfileRow } from "@/lib/database.types";

const initialState: FormState = {};

export function ProfessionalLinksForm({ initial }: { initial: TalentProfileRow }) {
  const [state, formAction, pending] = useActionState(updateProfessionalLinks, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div>
        <label htmlFor="linkedinUrl" className="text-sm font-semibold text-midnight">
          LinkedIn
        </label>
        <input
          id="linkedinUrl"
          name="linkedinUrl"
          placeholder="https://linkedin.com/in/…"
          defaultValue={initial.linkedin_url ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.linkedinUrl && <p className="mt-1 text-sm text-coral">{state.errors.linkedinUrl[0]}</p>}
      </div>

      <div>
        <label htmlFor="githubUrl" className="text-sm font-semibold text-midnight">
          GitHub
        </label>
        <input
          id="githubUrl"
          name="githubUrl"
          placeholder="https://github.com/…"
          defaultValue={initial.github_url ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.githubUrl && <p className="mt-1 text-sm text-coral">{state.errors.githubUrl[0]}</p>}
      </div>

      <div>
        <label htmlFor="websiteUrl" className="text-sm font-semibold text-midnight">
          Personal website
        </label>
        <input
          id="websiteUrl"
          name="websiteUrl"
          placeholder="https://…"
          defaultValue={initial.website_url ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.websiteUrl && <p className="mt-1 text-sm text-coral">{state.errors.websiteUrl[0]}</p>}
      </div>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-teal px-4 py-2 text-sm font-bold text-midnight disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save links"}
      </button>
    </form>
  );
}
