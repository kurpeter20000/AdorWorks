import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ApplyForm } from "./apply-form";

export const metadata: Metadata = { title: "Apply" };

export default async function ApplyPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole("talent");
  const { id } = await params;
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("id, title, brief")
    .eq("id", id)
    .eq("status", "open")
    .eq("visibility", "public")
    .maybeSingle();
  if (!opportunity) {
    notFound();
  }

  const { data: questions } = await supabase
    .from("screening_questions")
    .select("id, question, required")
    .eq("opportunity_id", id)
    .order("sequence", { ascending: true });

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">Apply — {opportunity.title}</h1>
      {opportunity.brief && <p className="mt-2 text-sm text-slate">{opportunity.brief}</p>}

      <ApplyForm opportunityId={opportunity.id} questions={questions ?? []} />
    </main>
  );
}
