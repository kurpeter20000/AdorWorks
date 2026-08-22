"use client";

import { useActionState } from "react";
import { updateAssistedField } from "@/lib/actions/assistance";
import type { FormState } from "@/lib/actions/auth";

const initialState: FormState = {};

const FIELD_LABELS: Record<string, string> = {
  legal_name: "Legal name",
  display_name: "Display name",
  headline: "Headline",
  bio: "Bio",
  location: "Location",
  category: "Category",
  skills: "Skills (comma-separated)",
  languages: "Languages (comma-separated)",
  availability: "Availability",
};

const MULTILINE_FIELDS = new Set(["bio"]);

export function AssistedFieldForm({
  sessionId,
  field,
  initialValue,
}: {
  sessionId: string;
  field: string;
  initialValue: string;
}) {
  const [state, formAction, pending] = useActionState(updateAssistedField, initialState);

  return (
    <form action={formAction} className="rounded-lg border border-slate/15 bg-white p-3">
      <input type="hidden" name="sessionId" value={sessionId} />
      <input type="hidden" name="field" value={field} />
      <label className="text-sm font-semibold text-midnight">{FIELD_LABELS[field] ?? field}</label>
      {MULTILINE_FIELDS.has(field) ? (
        <textarea
          name="value"
          rows={3}
          defaultValue={initialValue}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      ) : (
        <input
          name="value"
          defaultValue={initialValue}
          className="mt-1 w-full rounded-lg border border-slate/25 px-3 py-2 text-sm"
        />
      )}
      <div className="mt-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-teal px-3 py-1.5 text-xs font-bold text-midnight disabled:opacity-60"
        >
          {pending ? "Saving…" : "Save"}
        </button>
        {state.message && <span className="text-xs text-coral">{state.message}</span>}
      </div>
    </form>
  );
}
