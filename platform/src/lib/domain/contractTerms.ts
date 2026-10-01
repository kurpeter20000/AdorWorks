/**
 * Written terms of a contract (Stage 16, step 1).
 *
 * South Sudan's Labour Act 2017, s.44 requires an employer to give
 * written particulars of the engagement — the parties, the nature of the
 * work, its duration and the remuneration — even where the agreement
 * itself is oral. AdorWorks generates this for every contract so neither
 * side has to remember to. It is a summary of what was agreed on the
 * platform, not a substitute for legal advice or a separate contract.
 *
 * Pure (no I/O) so it's unit-testable; lib/dal/contractTerms.ts gathers
 * the data and stores immutable, versioned snapshots (0096).
 */

export interface TermsMilestone {
  title: string;
  amount: number;
  currency: string;
  dueDate: string | null;
}

export interface ContractTermsInput {
  contractId: string;
  startedAt: string;
  employer: { organisationName: string; representativeName: string | null };
  talent: { name: string };
  work: {
    title: string;
    description: string | null;
    engagementType: string | null;
    workMode: string | null;
    location: string | null;
    paymentBasis: string | null;
  };
  milestones: TermsMilestone[];
  /** Fees in force when this version was issued (informational — the rate is stamped on each payment). */
  fees: { enabled: boolean; employerPercent: number; talentPercent: number };
  cancellationPolicyUrl: string;
}

export interface ContractTermsContent {
  schema: 1;
  contractId: string;
  parties: {
    employer: { organisation: string; representative: string | null };
    talent: { name: string };
  };
  work: ContractTermsInput["work"];
  duration: { start: string; end: string | null; basis: string };
  remuneration: {
    currency: string;
    total: number;
    paymentBasis: string | null;
    milestones: TermsMilestone[];
    paymentMethod: string;
  };
  fees: ContractTermsInput["fees"] & { note: string };
  ending: string;
  disputes: string;
  legalNote: string;
}

export function buildTermsContent(input: ContractTermsInput): ContractTermsContent {
  const currency = input.milestones[0]?.currency ?? "SSP";
  const total = Math.round(input.milestones.reduce((sum, m) => sum + (Number(m.amount) || 0), 0) * 100) / 100;
  const dueDates = input.milestones.map((m) => m.dueDate).filter((d): d is string => !!d).sort();
  const end = dueDates.length ? dueDates[dueDates.length - 1] : null;

  return {
    schema: 1,
    contractId: input.contractId,
    parties: {
      employer: { organisation: input.employer.organisationName, representative: input.employer.representativeName },
      talent: { name: input.talent.name },
    },
    work: input.work,
    duration: {
      start: input.startedAt,
      end,
      basis: end
        ? "The work runs from the start date until the last milestone due date, or until every milestone is completed, whichever is later."
        : "The work runs from the start date until every milestone is completed, or until the contract is ended as described below.",
    },
    remuneration: {
      currency,
      total,
      paymentBasis: input.work.paymentBasis,
      milestones: input.milestones,
      paymentMethod:
        "Each milestone is paid through AdorWorks once the employer approves the delivered work. The talent is paid by mobile money.",
    },
    fees: {
      ...input.fees,
      note: input.fees.enabled
        ? `AdorWorks adds a ${input.fees.employerPercent}% fee to what the employer pays and deducts a ${input.fees.talentPercent}% fee from what the talent receives. The rate in force is shown on each payment receipt.`
        : "AdorWorks does not currently charge a fee on this contract's payments. Any future fee is announced in advance and shown on each payment receipt.",
    },
    ending: `Either party may end the contract through AdorWorks, giving a reason. Work already approved is still paid. See the AdorWorks cancellation and refund policy: ${input.cancellationPolicyUrl}`,
    disputes:
      "If something goes wrong, either party can raise a dispute on the contract page. AdorWorks staff review it and record the outcome.",
    legalNote:
      "These written particulars are issued by AdorWorks under the South Sudan Labour Act 2017 (section 44). They summarise what the parties agreed on AdorWorks and do not replace any separate written contract between them.",
  };
}

/**
 * A stable string for change detection. Fees are left out on purpose:
 * switching platform fees on or off must not re-issue every contract's
 * terms — the rate actually applied is stamped on each payment instead.
 */
export function termsFingerprint(content: ContractTermsContent): string {
  const { fees: _fees, ...rest } = content;
  void _fees;
  return stableStringify(rest);
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.keys(value as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}
