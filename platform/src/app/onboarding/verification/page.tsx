import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { VerificationForm } from "./verification-form";

export const metadata: Metadata = { title: "Identity verification" };

export default async function VerificationPage() {
  const session = await requireRole("talent");
  const supabase = await createClient();

  const { data: existing } = await supabase
    .from("talent_evidence")
    .select("id, status, created_at")
    .eq("talent_id", session.userId)
    .eq("evidence_type", "identity")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return (
    <div>
      <h1 className="text-xl font-bold text-midnight">Request identity verification</h1>
      <p className="mt-1 text-sm text-slate">
        Upload a government-issued ID. This confirms your identity — a
        separate thing from confirming your email address. A human
        reviewer checks this; we don&apos;t use facial recognition or an
        automated decision.
      </p>

      {existing ? (
        <div className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
          <p className="text-sm font-semibold text-midnight">
            Submitted — status: <span className="capitalize">{existing.status}</span>
          </p>
          <p className="mt-1 text-sm text-slate">
            You can continue to the next step, or upload a replacement below if needed.
          </p>
        </div>
      ) : null}

      <VerificationForm hasExisting={Boolean(existing)} />
    </div>
  );
}
