import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { StatusBadge } from "@/components/status-badge";
import { requireSession } from "@/lib/dal/session";
import { CONTRACT_STATES, MILESTONE_STATES } from "@/lib/domain/states";
import { isFeatureEnabled, FEATURE_FLAGS } from "@/lib/domain/featureFlags";
import { createClient } from "@/lib/supabase/server";
import type { DeliverableRow } from "@/lib/database.types";
import { DeliverableForm } from "./deliverable-form";
import { ReviewActions } from "./review-actions";
import { ReceiptView } from "./receipt-view";
import { MessageThread } from "./message-thread";
import { ReviewSection } from "./review-section";
import { TimesheetsSection } from "./timesheets-section";
import { DisputeSection } from "./dispute-section";
import { CancelContractSection } from "./cancel-contract-section";

export const metadata: Metadata = { title: "Contract" };

// Split out of the main bundle — only ever rendered for an employer once a
// milestone is 'approved', so most contract-page visits never need it.
const PaymentCheckout = dynamic(() => import("./payment-checkout").then((m) => m.PaymentCheckout));

export default async function ContractDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  const { data: contract } = await supabase.from("contracts").select("*").eq("id", id).maybeSingle();
  if (!contract) notFound();

  const isTalent = contract.talent_id === session.userId;
  const [{ data: opportunity }, { data: org }] = await Promise.all([
    supabase.from("opportunities").select("title").eq("id", contract.opportunity_id).maybeSingle(),
    supabase.from("organisations").select("id, name, representative_id").eq("id", contract.organisation_id).maybeSingle(),
  ]);
  const isEmployer = org?.representative_id === session.userId;
  if (!isTalent && !isEmployer && !["reviewer", "matcher", "finance", "admin"].includes(session.role)) {
    notFound();
  }

  const { data: talent } = await supabase
    .from("talent_profiles")
    .select("display_name")
    .eq("id", contract.talent_id)
    .maybeSingle();

  const { data: milestones } = await supabase
    .from("milestones")
    .select("*")
    .eq("contract_id", contract.id)
    .order("sequence", { ascending: true });

  const milestoneIds = (milestones ?? []).map((m) => m.id);
  const { data: deliverables } =
    milestoneIds.length > 0
      ? await supabase
          .from("deliverables")
          .select("*")
          .in("milestone_id", milestoneIds)
          .order("created_at", { ascending: false })
      : { data: [] };
  const latestDeliverableByMilestone = new Map<string, DeliverableRow>();
  for (const d of deliverables ?? []) {
    if (!latestDeliverableByMilestone.has(d.milestone_id)) latestDeliverableByMilestone.set(d.milestone_id, d);
  }

  const { data: paymentEvents } = await supabase
    .from("payment_events")
    .select(
      "milestone_id, external_reference, amount, currency, provider_name, payer_phone, card_last4, card_brand, receipt_number, created_at, fee_percent, fee_amount, net_amount, is_simulated"
    )
    .eq("contract_id", contract.id);
  const paymentByMilestone = new Map((paymentEvents ?? []).map((p) => [p.milestone_id, p]));

  const { data: conversation } = await supabase
    .from("conversations")
    .select("id")
    .eq("contract_id", contract.id)
    .maybeSingle();
  const { data: messages } = conversation
    ? await supabase
        .from("messages")
        .select("id, sender_id, body, file_path, file_name, created_at")
        .eq("conversation_id", conversation.id)
        .order("created_at", { ascending: true })
    : { data: [] };

  const { data: timesheets } = await supabase
    .from("timesheets")
    .select("*")
    .eq("contract_id", contract.id)
    .order("period_start", { ascending: false });

  const { data: disputes } = await supabase
    .from("disputes")
    .select("*")
    .eq("contract_id", contract.id)
    .order("created_at", { ascending: false });

  let myReview: { rating: number; feedback: string | null } | null = null;
  let theirReview: { rating: number; feedback: string | null } | null = null;
  if (contract.status === "completed") {
    const { data: reviews } = await supabase
      .from("reviews")
      .select("reviewer_role, rating, feedback")
      .eq("contract_id", contract.id);
    const myRole = isTalent ? "talent" : "employer";
    myReview = (reviews ?? []).find((r) => r.reviewer_role === myRole) ?? null;
    theirReview = (reviews ?? []).find((r) => r.reviewer_role !== myRole) ?? null;
  }

  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8">
      <h1 className="text-2xl font-extrabold text-midnight">{opportunity?.title ?? "Contract"}</h1>
      <p className="mt-1 text-sm text-slate">
        {isTalent ? `With ${org?.name ?? "your employer"}` : `With ${talent?.display_name ?? "your talent"}`} ·{" "}
        <StatusBadge state={CONTRACT_STATES[contract.status]} className="ml-1" />
      </p>

      {contract.status === "completed" && (
        <p className="mt-4 rounded-lg bg-violet/10 px-4 py-3 text-sm font-semibold text-violet">
          Contract completed — added to {isTalent ? "your" : "their"} work history.
        </p>
      )}

      {contract.status === "disputed" && (
        <p className="mt-4 rounded-lg bg-coral/10 px-4 py-3 text-sm font-semibold text-coral">
          This contract is paused while AdorWorks staff review an open dispute — see below.
        </p>
      )}

      {contract.status === "cancelled" && (
        <div className="mt-4 rounded-lg bg-slate/10 px-4 py-3 text-sm text-slate">
          <p className="font-semibold text-midnight">This contract was cancelled.</p>
          {contract.cancellation_reason && <p className="mt-1">{contract.cancellation_reason}</p>}
        </div>
      )}

      <div className="mt-8 space-y-4">
        <h2 className="font-bold text-midnight">Milestones</h2>
        {(milestones ?? []).map((m) => {
          const deliverable = latestDeliverableByMilestone.get(m.id);
          const payment = paymentByMilestone.get(m.id);
          return (
            <div key={m.id} className="rounded-xl border border-slate/15 bg-white p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="font-semibold text-midnight">{m.title}</p>
                  <p className="text-xs text-slate">
                    {m.currency} {m.amount.toLocaleString()}
                  </p>
                </div>
                <StatusBadge state={MILESTONE_STATES[m.status]} className="whitespace-nowrap" />
              </div>

              {deliverable && (
                <div className="mt-3 rounded-lg bg-cloud p-3 text-sm">
                  <p className="font-semibold text-midnight">Latest submission</p>
                  {deliverable.note && <p className="mt-1 text-slate">{deliverable.note}</p>}
                  {deliverable.file_path && (
                    <p className="mt-1 text-xs text-slate">File attached — visible to AdorWorks staff and both parties.</p>
                  )}
                </div>
              )}

              {payment && (
                <div className="mt-3">
                  <p className="text-xs font-semibold text-teal-ink">
                    {payment.is_simulated ? "Simulated" : "Live"} payment recorded ({payment.currency}{" "}
                    {payment.amount.toLocaleString()}){payment.is_simulated ? " — no real money moved." : "."}
                  </p>
                  <ReceiptView
                    receiptNumber={payment.receipt_number}
                    amount={payment.amount}
                    currency={payment.currency}
                    providerName={payment.provider_name}
                    payerPhone={payment.payer_phone}
                    cardLast4={payment.card_last4}
                    cardBrand={payment.card_brand}
                    externalReference={payment.external_reference}
                    createdAt={payment.created_at}
                    feePercent={payment.fee_percent}
                    feeAmount={payment.fee_amount}
                    netAmount={payment.net_amount}
                    isSimulated={payment.is_simulated}
                  />
                </div>
              )}

              {isTalent && ["pending", "revision_requested"].includes(m.status) && (
                <DeliverableForm contractId={contract.id} milestoneId={m.id} />
              )}

              {isEmployer && deliverable && m.status === "submitted" && (
                <ReviewActions deliverableId={deliverable.id} />
              )}

              {isEmployer && m.status === "approved" && (
                <PaymentCheckout
                  milestoneId={m.id}
                  amount={m.amount}
                  currency={m.currency}
                  realPaymentsEnabled={isFeatureEnabled(FEATURE_FLAGS.REAL_PAYMENTS)}
                />
              )}
            </div>
          );
        })}
      </div>

      {(isTalent || isEmployer) && <TimesheetsSection contractId={contract.id} isTalent={isTalent} isEmployer={isEmployer} timesheets={timesheets ?? []} />}

      <div className="mt-8">
        <h2 className="font-bold text-midnight">Messages</h2>
        <MessageThread
          contractId={contract.id}
          currentUserId={session.userId}
          messages={messages ?? []}
        />
      </div>

      {(isTalent || isEmployer) && contract.status === "completed" && (
        <ReviewSection
          contractId={contract.id}
          reviewerRole={isTalent ? "talent" : "employer"}
          myReview={myReview}
          theirReview={theirReview}
        />
      )}

      {(isTalent || isEmployer) && (
        <DisputeSection contractId={contract.id} contractStatus={contract.status} disputes={disputes ?? []} />
      )}

      {(isTalent || isEmployer) && contract.status === "active" && (
        <div className="mt-8">
          <CancelContractSection contractId={contract.id} />
        </div>
      )}
    </main>
  );
}
