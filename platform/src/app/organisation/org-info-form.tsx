"use client";

import { useActionState } from "react";
import { updateOrganisation } from "@/lib/actions/organisation";
import type { FormState } from "@/lib/actions/auth";
import type { OrganisationRow } from "@/lib/database.types";

const initialState: FormState = {};

export function OrgInfoForm({ organisationId, initial }: { organisationId: string; initial: OrganisationRow }) {
  const boundAction = updateOrganisation.bind(null, organisationId);
  const [state, formAction, pending] = useActionState(boundAction, initialState);

  return (
    <form action={formAction} className="mt-4 space-y-3">
      <div>
        <label htmlFor="name" className="text-sm font-semibold text-midnight">
          Organisation or business name
        </label>
        <input
          id="name"
          name="name"
          required
          defaultValue={initial.name}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.name && <p className="mt-1 text-sm text-coral">{state.errors.name[0]}</p>}
      </div>

      <div>
        <label htmlFor="sector" className="text-sm font-semibold text-midnight">
          Sector <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="sector"
          name="sector"
          placeholder="e.g. NGO, media, technology, retail"
          defaultValue={initial.sector ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="website" className="text-sm font-semibold text-midnight">
          Website <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="website"
          name="website"
          placeholder="https://"
          defaultValue={initial.website ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <label htmlFor="billingEmail" className="text-sm font-semibold text-midnight">
          Billing email <span className="font-normal text-slate">(optional)</span>
        </label>
        <input
          id="billingEmail"
          name="billingEmail"
          type="email"
          defaultValue={initial.billing_email ?? ""}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
        {state.errors?.billingEmail && (
          <p className="mt-1 text-sm text-coral">{state.errors.billingEmail[0]}</p>
        )}
      </div>

      {state.message && <p className="text-sm text-coral">{state.message}</p>}

      <button
        type="submit"
        disabled={pending}
        className="rounded-lg bg-violet px-4 py-2 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save changes"}
      </button>
    </form>
  );
}
