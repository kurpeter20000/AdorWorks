import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSession } from "@/lib/dal/session";
import { createClient } from "@/lib/supabase/server";
import { ensureContractTerms } from "@/lib/dal/contractTerms";
import { StatePanel } from "@/components/state-panel";
import { formatDate, formatDateTime } from "@/lib/domain/format";
import { ENGAGEMENT_TYPE_LABEL, PAYMENT_BASIS_LABEL, WORK_MODE_LABEL } from "@/lib/domain/taxonomy";
import { PrintButton } from "./print-button";

export const metadata: Metadata = { title: "Written terms" };

const label = (map: Record<string, string>, value: string | null) => (value ? (map[value] ?? value.replace(/_/g, " ")) : "—");

export default async function ContractTermsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSession();
  const { id } = await params;
  const supabase = await createClient();

  // Access check with the viewer's own session first (contracts RLS):
  // only the two parties, their organisation and staff get this far.
  const { data: contract } = await supabase.from("contracts").select("id").eq("id", id).maybeSingle();
  if (!contract) notFound();

  const terms = await ensureContractTerms(contract.id, session.userId);
  const { data: history } = await supabase
    .from("contract_terms")
    .select("version, generated_at")
    .eq("contract_id", contract.id)
    .order("version", { ascending: false });

  if (!terms) {
    return (
      <main className="mx-auto max-w-2xl p-6 sm:p-8">
        <StatePanel title="Written terms aren't available right now" tone="danger" role="alert">
          Something went wrong preparing them. Refresh to try again — your contract itself is unaffected.
        </StatePanel>
      </main>
    );
  }

  const t = terms.content;
  return (
    <main className="mx-auto max-w-2xl p-6 sm:p-8 print:max-w-none print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/contracts/${contract.id}`} className="text-sm font-semibold text-teal-ink underline">
          ← Back to contract
        </Link>
        <PrintButton />
      </div>

      <article className="mt-4 rounded-xl border border-slate/15 bg-white p-6 text-sm text-midnight sm:p-8 print:border-none print:p-0">
        <p className="text-xs font-semibold tracking-wide text-slate uppercase">AdorWorks · Written terms of engagement</p>
        <h1 className="mt-1 text-2xl font-extrabold">{t.work.title}</h1>
        <p className="mt-1 text-xs text-slate">
          Version {terms.version} · issued {formatDateTime(terms.generated_at)} · contract {t.contractId.slice(0, 8).toUpperCase()}
        </p>

        <Section title="1. The parties">
          <Row k="Employer" v={t.parties.employer.organisation} />
          <Row k="Signing for the employer" v={t.parties.employer.representative ?? "—"} />
          <Row k="Talent" v={t.parties.talent.name} />
        </Section>

        <Section title="2. The work">
          <Row k="Title" v={t.work.title} />
          {t.work.description && <Row k="Description" v={t.work.description} />}
          <Row k="Type of engagement" v={label(ENGAGEMENT_TYPE_LABEL, t.work.engagementType)} />
          <Row k="Work mode" v={label(WORK_MODE_LABEL, t.work.workMode)} />
          <Row k="Location" v={t.work.location ?? "—"} />
        </Section>

        <Section title="3. Duration">
          <Row k="Start" v={formatDate(t.duration.start, { day: "numeric", month: "long", year: "numeric" })} />
          <Row k="Expected end" v={t.duration.end ? formatDate(t.duration.end, { day: "numeric", month: "long", year: "numeric" }) : "When all milestones are complete"} />
          <p className="mt-2 text-slate">{t.duration.basis}</p>
        </Section>

        <Section title="4. Remuneration">
          <Row k="Total" v={`${t.remuneration.currency} ${t.remuneration.total.toLocaleString()}`} />
          <Row k="Payment basis" v={label(PAYMENT_BASIS_LABEL, t.remuneration.paymentBasis)} />
          <table className="mt-3 w-full text-start text-sm">
            <thead className="text-xs text-slate">
              <tr>
                <th className="py-1 text-start font-semibold">Milestone</th>
                <th className="py-1 text-start font-semibold">Due</th>
                <th className="py-1 text-end font-semibold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {t.remuneration.milestones.map((m, i) => (
                <tr key={i} className="border-t border-slate/10">
                  <td className="py-1.5">{m.title}</td>
                  <td className="py-1.5">{m.dueDate ? formatDate(m.dueDate, { day: "numeric", month: "short", year: "numeric" }) : "—"}</td>
                  <td className="py-1.5 text-end">
                    {m.currency} {Number(m.amount).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-slate">{t.remuneration.paymentMethod}</p>
          <p className="mt-2 text-slate">{t.fees.note}</p>
        </Section>

        <Section title="5. Ending the contract">
          <p>{t.ending}</p>
        </Section>
        <Section title="6. Disputes">
          <p>{t.disputes}</p>
        </Section>

        <p className="mt-6 border-t border-slate/15 pt-4 text-xs text-slate">{t.legalNote}</p>
      </article>

      {(history ?? []).length > 1 && (
        <div className="mt-4 text-xs text-slate print:hidden">
          <p className="font-semibold text-midnight">Earlier versions</p>
          <p className="mt-1">
            These terms were re-issued when the agreement changed. Every version is kept on record:{" "}
            {(history ?? [])
              .filter((h) => h.version !== terms.version)
              .map((h) => `version ${h.version} (${formatDate(h.generated_at, { day: "numeric", month: "short", year: "numeric" })})`)
              .join(", ")}
            .
          </p>
        </div>
      )}
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6 break-inside-avoid">
      <h2 className="mb-2 text-base font-bold">{title}</h2>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid grid-cols-[10rem_1fr] gap-3">
      <span className="text-slate">{k}</span>
      <span className="min-w-0 break-words">{v}</span>
    </div>
  );
}
