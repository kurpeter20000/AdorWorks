import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { requireOrganisationMembership } from "@/lib/dal/organisation";
import { APPLICATION_STATES, OPPORTUNITY_STATES } from "@/lib/domain/states";
import { createClient } from "@/lib/supabase/server";
import { AppealRejectionForm } from "./appeal-rejection-form";
import { ApplicantEvaluationPanel } from "./applicant-evaluation-panel";
import { CloseOpportunityActions } from "./close-opportunity-actions";
import { SendOfferForm } from "./send-offer-form";
import { ShortlistingModeForm } from "./shortlisting-mode-form";
import { ShortlistActions } from "./shortlist-actions";

export const metadata: Metadata = { title: "Opportunity" };

export default async function OpportunityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ offered?: string; resubmitted?: string }>;
}) {
  const { org, session } = await requireOrganisationMembership();
  const { id } = await params;
  const { offered, resubmitted } = await searchParams;
  const supabase = await createClient();

  const { data: opportunity } = await supabase
    .from("opportunities")
    .select("*")
    .eq("id", id)
    .eq("organisation_id", org.id)
    .maybeSingle();
  if (!opportunity) {
    notFound();
  }

  const { data: applications } = await supabase
    .from("applications")
    .select("id, talent_id, stage, pitch, created_at")
    .eq("opportunity_id", opportunity.id)
    .order("created_at", { ascending: false });

  const talentIds = [...new Set((applications ?? []).map((a) => a.talent_id))];
  const { data: talents } =
    talentIds.length > 0
      ? await supabase.from("talent_profiles").select("id, display_name, headline").in("id", talentIds)
      : { data: [] };
  const talentById = new Map((talents ?? []).map((t) => [t.id, t]));

  const applicationIds = (applications ?? []).map((a) => a.id);
  const { data: screeningAnswers } =
    applicationIds.length > 0
      ? await supabase
          .from("screening_answers")
          .select("application_id, answer, screening_question_id")
          .in("application_id", applicationIds)
      : { data: [] };
  const { data: screeningQuestions } = await supabase
    .from("screening_questions")
    .select("id, question")
    .eq("opportunity_id", opportunity.id);
  const questionById = new Map((screeningQuestions ?? []).map((q) => [q.id, q.question]));
  const answersByApplication = new Map<string, { question: string; answer: string }[]>();
  for (const a of screeningAnswers ?? []) {
    const list = answersByApplication.get(a.application_id) ?? [];
    list.push({ question: questionById.get(a.screening_question_id) ?? "Question", answer: a.answer });
    answersByApplication.set(a.application_id, list);
  }

  const { data: offers } = await supabase
    .from("offers")
    .select("id, application_id, status")
    .eq("opportunity_id", opportunity.id);
  const offerByApplication = new Map((offers ?? []).map((o) => [o.application_id, o]));

  const offerIds = (offers ?? []).map((o) => o.id);
  const { data: contracts } =
    offerIds.length > 0
      ? await supabase.from("contracts").select("id, offer_id").in("offer_id", offerIds)
      : { data: [] };
  const contractIdByOffer = new Map((contracts ?? []).map((c) => [c.offer_id, c.id]));

  const [{ data: scores }, { data: notes }, { data: interviewDetails }] = await Promise.all([
    supabase.from("application_scorecards").select("application_id, criterion, score, note, scored_by").in("application_id", applicationIds),
    supabase
      .from("application_notes")
      .select("id, application_id, author_id, body, created_at")
      .in("application_id", applicationIds)
      .order("created_at", { ascending: false }),
    supabase.from("applications").select("id, interview_scheduled_at, interview_notes").in("id", applicationIds),
  ]);
  const scoresByApplication = new Map<string, NonNullable<typeof scores>>();
  for (const s of scores ?? []) {
    const list = scoresByApplication.get(s.application_id) ?? [];
    list.push(s);
    scoresByApplication.set(s.application_id, list);
  }
  const notesByApplication = new Map<string, NonNullable<typeof notes>>();
  for (const n of notes ?? []) {
    const list = notesByApplication.get(n.application_id) ?? [];
    list.push(n);
    notesByApplication.set(n.application_id, list);
  }
  const interviewByApplication = new Map((interviewDetails ?? []).map((i) => [i.id, i]));

  const noteAuthorIds = [...new Set((notes ?? []).map((n) => n.author_id))];
  const { data: noteAuthors } =
    noteAuthorIds.length > 0 ? await supabase.from("profiles").select("id, full_name").in("id", noteAuthorIds) : { data: [] };
  const noteAuthorNameById = new Map((noteAuthors ?? []).map((p) => [p.id, p.full_name]));

  const { data: conversations } =
    applicationIds.length > 0
      ? await supabase.from("conversations").select("id, application_id").in("application_id", applicationIds)
      : { data: [] };
  const conversationIdByApplication = new Map(
    (conversations ?? []).filter((c): c is typeof c & { application_id: string } => c.application_id !== null).map((c) => [c.application_id, c.id])
  );
  const conversationIds = (conversations ?? []).map((c) => c.id);
  const { data: applicationMessages } =
    conversationIds.length > 0
      ? await supabase
          .from("messages")
          .select("id, conversation_id, sender_id, body, created_at")
          .in("conversation_id", conversationIds)
          .order("created_at", { ascending: true })
      : { data: [] };
  const messagesByApplication = new Map<string, NonNullable<typeof applicationMessages>>();
  for (const [applicationId, conversationId] of conversationIdByApplication) {
    messagesByApplication.set(
      applicationId,
      (applicationMessages ?? []).filter((m) => m.conversation_id === conversationId)
    );
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{opportunity.title}</h1>
      <div className="mt-2">
        <StatusBadge state={OPPORTUNITY_STATES[opportunity.status]} />
      </div>

      <ShortlistingModeForm opportunityId={opportunity.id} mode={opportunity.shortlisting_mode} />

      {opportunity.status === "rejected" && opportunity.rejection_reason && (
        <div className="mt-4 rounded-lg bg-coral/10 px-4 py-3 text-sm text-coral">
          <p>Not approved: {opportunity.rejection_reason}</p>
          {opportunity.appeal_note ? (
            <p className="mt-2 text-midnight">Appeal submitted: {opportunity.appeal_note}</p>
          ) : (
            <AppealRejectionForm opportunityId={opportunity.id} />
          )}
        </div>
      )}

      {opportunity.status === "expired" && (
        <p className="mt-4 rounded-lg bg-slate/10 px-4 py-3 text-sm text-slate">
          This opportunity expired after its application deadline passed.
        </p>
      )}

      {opportunity.status === "open" && <CloseOpportunityActions opportunityId={opportunity.id} />}

      {opportunity.status === "changes_required" && (
        <div className="mt-4 rounded-lg bg-violet/10 px-4 py-3 text-sm text-midnight">
          {opportunity.status_note && <p>Staff requested changes: {opportunity.status_note}</p>}
          <Link
            href={`/organisation/opportunities/${opportunity.id}/edit`}
            className="mt-2 inline-block font-semibold text-teal-ink underline"
          >
            Edit &amp; resubmit
          </Link>
        </div>
      )}

      {opportunity.status === "draft" && (
        <div className="mt-4 rounded-lg bg-violet/10 px-4 py-3 text-sm text-midnight">
          <p>This is a saved project brief — it hasn&rsquo;t been submitted for review yet.</p>
          <Link
            href={`/organisation/opportunities/${opportunity.id}/edit`}
            className="mt-2 inline-block font-semibold text-teal-ink underline"
          >
            Finish and submit
          </Link>
        </div>
      )}

      {opportunity.status === "paused" && opportunity.status_note && (
        <p className="mt-4 rounded-lg bg-slate/10 px-4 py-3 text-sm text-slate">
          Paused: {opportunity.status_note}
        </p>
      )}

      {offered && (
        <p className="mt-4 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-ink">
          Offer sent.
        </p>
      )}

      {resubmitted && (
        <p className="mt-4 rounded-lg bg-teal/10 px-4 py-3 text-sm font-semibold text-teal-ink">
          Submitted for review.
        </p>
      )}

      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h2 className="font-bold text-midnight">Applicants</h2>
          <div className="flex items-center gap-3">
            {applications && applications.length > 1 && (
              <Link href={`/organisation/opportunities/${opportunity.id}/compare`} className="text-xs font-semibold text-teal-ink underline">
                Compare
              </Link>
            )}
            <Link href={`/organisation/opportunities/${opportunity.id}/invite`} className="text-xs font-semibold text-violet underline">
              Invite talent
            </Link>
            {opportunity.shortlisting_mode === "self_service" && (
              <Link href={`/organisation/opportunities/${opportunity.id}/find-talent`} className="text-xs font-semibold text-violet underline">
                Find talent
              </Link>
            )}
          </div>
        </div>
        <p className="mt-1 text-xs text-slate">
          {opportunity.shortlisting_mode === "self_service"
            ? "You're shortlisting this one yourself — every applicant appears below as they apply, or search and add candidates directly."
            : "Only shows once AdorWorks staff have shortlisted an applicant — this is the same curated-shortlist review every opportunity goes through."}
        </p>

        {!applications || applications.length === 0 ? (
          <p className="mt-4 text-sm text-slate">
            {opportunity.shortlisting_mode === "self_service" ? "No applicants yet." : "No shortlisted applicants yet."}
          </p>
        ) : (
          <ul className="mt-4 space-y-3">
            {applications.map((a) => {
              const talent = talentById.get(a.talent_id);
              const offer = offerByApplication.get(a.id);
              const contractId = offer ? contractIdByOffer.get(offer.id) : undefined;
              return (
                <li key={a.id} className="rounded-xl border border-slate/15 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      {talent ? (
                        <Link
                          href={`/passport/${talent.id}`}
                          className="font-semibold text-midnight underline decoration-slate/30 hover:decoration-teal"
                        >
                          {talent.display_name ?? "AdorWorks talent"}
                        </Link>
                      ) : (
                        <p className="font-semibold text-midnight">AdorWorks talent</p>
                      )}
                      <p className="text-xs text-slate">{talent?.headline}</p>
                    </div>
                    <StatusBadge state={APPLICATION_STATES[a.stage]} className="whitespace-nowrap" />
                  </div>

                  {a.pitch && <p className="mt-3 text-sm text-slate">{a.pitch}</p>}

                  {(answersByApplication.get(a.id) ?? []).length > 0 && (
                    <div className="mt-3 space-y-2 rounded-lg bg-cloud p-3">
                      {(answersByApplication.get(a.id) ?? []).map((qa, i) => (
                        <div key={i}>
                          <p className="text-xs font-semibold text-midnight">{qa.question}</p>
                          <p className="text-xs text-slate">{qa.answer}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {contractId ? (
                    <Link
                      href={`/contracts/${contractId}`}
                      className="mt-3 inline-block text-xs font-semibold text-teal-ink underline"
                    >
                      View contract
                    </Link>
                  ) : offer ? (
                    <p className="mt-3 text-xs font-semibold text-violet">Offer {offer.status}</p>
                  ) : ["shortlisted", "interviewing"].includes(a.stage) ? (
                    <SendOfferForm applicationId={a.id} />
                  ) : a.stage === "submitted" && opportunity.shortlisting_mode === "self_service" ? (
                    <ShortlistActions applicationId={a.id} opportunityId={opportunity.id} />
                  ) : null}

                  <ApplicantEvaluationPanel
                    applicationId={a.id}
                    opportunityId={opportunity.id}
                    myUserId={session.userId}
                    scores={scoresByApplication.get(a.id) ?? []}
                    notes={(notesByApplication.get(a.id) ?? []).map((n) => ({
                      ...n,
                      authorName: noteAuthorNameById.get(n.author_id) ?? "Teammate",
                    }))}
                    interviewScheduledAt={interviewByApplication.get(a.id)?.interview_scheduled_at ?? null}
                    interviewNotes={interviewByApplication.get(a.id)?.interview_notes ?? null}
                    messages={messagesByApplication.get(a.id) ?? []}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
