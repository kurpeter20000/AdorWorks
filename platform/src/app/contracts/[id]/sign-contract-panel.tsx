"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Check } from "lucide-react";
import { signContract } from "@/lib/actions/contractSigning";
import { buttonVariants } from "@/components/ui/button";

export interface SignatureState {
  termsVersion: number;
  talentSignedAt: string | null;
  organisationSignedAt: string | null;
}

/** Both sides confirm the written terms (0113); shows who has signed. */
export function SignContractPanel({
  contractId,
  viewerParty,
  state,
  names,
}: {
  contractId: string;
  viewerParty: "talent" | "organisation";
  state: SignatureState;
  names: { talent: string; organisation: string };
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const mine = viewerParty === "talent" ? state.talentSignedAt : state.organisationSignedAt;
  const both = state.talentSignedAt && state.organisationSignedAt;

  const row = (label: string, at: string | null) => (
    <li className="flex items-center gap-2 text-sm">
      <span className={`flex size-5 items-center justify-center rounded-full ${at ? "bg-teal/15 text-teal-ink" : "border border-slate/30"}`}>
        {at && <Check className="size-3.5" aria-hidden="true" />}
      </span>
      <span className="text-midnight">{label}</span>
      <span className="text-slate">{at ? `signed ${new Date(at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}` : "not signed yet"}</span>
    </li>
  );

  return (
    <section aria-labelledby="sign-h" className={`mt-6 rounded-card border p-5 shadow-card ${both ? "border-line bg-white" : "border-coral/30 bg-white"}`}>
      <h2 id="sign-h" className="text-lg font-extrabold text-midnight">
        {both ? "Contract signed" : "Sign the contract"}
      </h2>
      <p className="mt-1 text-sm text-slate">
        Both sides confirm the written terms (version {state.termsVersion}).{" "}
        <Link href={`/contracts/${contractId}/terms`} className="font-semibold text-teal-ink underline">
          Read the terms
        </Link>
      </p>
      <ul className="mt-3 space-y-1.5">
        {row(names.talent, state.talentSignedAt)}
        {row(names.organisation, state.organisationSignedAt)}
      </ul>
      {!mine && (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await signContract(contractId);
              if (r.error) setError(r.error);
            })
          }
          className={`${buttonVariants({ variant: "primary" })} mt-4`}
        >
          {pending ? "Signing…" : "I've read the terms and agree"}
        </button>
      )}
      {error && (
        <p className="mt-2 text-sm text-coral-ink" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
