import type { Metadata } from "next";
import { requireRole } from "@/lib/dal/session";
import { staffAreaRoles } from "@/lib/domain/staffAccess";
import { getCollectionAccounts, getEscrowRates, getFeeRates, getFxRate, getReceivingBankAccounts, isGuaranteeEnabled, isProgrammeSharingEnabled } from "@/lib/dal/settings";
import { createAdminClient } from "@/lib/supabase/admin";
import { FeatureSwitchForm } from "./feature-switch-form";
import { ProgrammesPanel, type ProgrammeView } from "./programmes-panel";
import { PartnerOrgs } from "./partner-orgs";
import { FxForm } from "./fx-form";
import { guaranteeRemedy } from "@/lib/domain/guarantee";
import { calculateFees } from "@/lib/domain/fees";
import { StatePanel } from "@/components/state-panel";
import { FeeSettingsForm } from "./fee-settings-form";
import { EscrowSettingsForm } from "./escrow-settings-form";
import { BankAccountForm } from "./bank-account-form";
import { CollectionAccountsForm } from "./collection-accounts-form";

export const metadata: Metadata = { title: "Settings — Operations" };

export default async function OperationsSettingsPage() {
  const session = await requireRole(...staffAreaRoles("settings"));
  const rates = await getFeeRates();
  const escrowRates = await getEscrowRates();
  const bankAccounts = await getReceivingBankAccounts();
  const bankCurrencies = [bankAccounts.SSP && "SSP", (bankAccounts.USD || bankAccounts["*"]) && "USD"].filter(Boolean) as string[];
  const collection = await getCollectionAccounts();
  const fx = await getFxRate();
  const [guaranteeOn, sharingOn] = await Promise.all([isGuaranteeEnabled(), isProgrammeSharingEnabled()]);
  const programmes = await loadProgrammes();
  const { data: orgRows } = await createAdminClient()
    .from("organisations")
    .select("id, name, verification_status, is_programme_partner")
    .order("name", { ascending: true })
    .limit(500);
  const partnerOrgOptions = (orgRows ?? []).map((o) => ({ id: o.id, name: o.name, verified: o.verification_status === "verified", partner: o.is_programme_partner }));
  const canEdit = session.role === "finance" || session.role === "admin";
  const example = calculateFees(10000, { ...rates, enabled: true });

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-extrabold text-midnight">Settings</h1>
      <p className="mt-1 text-sm text-slate">Platform-wide settings that change without a new release.</p>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">Platform fees</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${rates.enabled ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}
          >
            {rates.enabled ? "Charging now" : "Switched off — 0% charged"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          The employer pays a fee on top of the agreed amount; the talent receives the agreed amount minus their fee.
          Each payment keeps the rate that applied when it was made.
        </p>
        <p className="mt-2 rounded-lg bg-cloud px-3 py-2 text-xs text-slate">
          Example at these rates, on an agreed SSP 10,000: employer pays SSP {example.totalCharged.toLocaleString()}, talent
          receives SSP {example.netAmount.toLocaleString()}, AdorWorks keeps SSP {example.platformRevenue.toLocaleString()}.
        </p>

        {!rates.loaded && (
          <div className="mt-3">
            <StatePanel title="Couldn't read the saved settings" tone="danger" role="alert">
              Until this is fixed, no fee is charged. Check that migration 0096 has been applied.
            </StatePanel>
          </div>
        )}

        {canEdit ? (
          <FeeSettingsForm enabled={rates.enabled} employerPercent={rates.employerPercent} talentPercent={rates.talentPercent} />
        ) : (
          <p className="mt-4 text-sm text-slate">
            Employer fee {rates.employerPercent}% · Talent fee {rates.talentPercent}%. Only finance and admin staff can change these.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">Escrow</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${escrowRates.enabled ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}
          >
            {escrowRates.enabled ? "Holding payments" : "Switched off — releases instantly"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          When on, a milestone payment is held for the dispute window below before AdorWorks disburses the talent&rsquo;s
          share — see <a href="/operations/payouts" className="font-semibold text-teal-ink underline">Payouts</a> for
          releases due.
        </p>

        {!escrowRates.loaded && (
          <div className="mt-3">
            <StatePanel title="Couldn't read the saved settings" tone="danger" role="alert">
              Until this is fixed, escrow stays off. Check that migration 0099 has been applied.
            </StatePanel>
          </div>
        )}

        {canEdit ? (
          <EscrowSettingsForm enabled={escrowRates.enabled} disputeWindowDays={escrowRates.disputeWindowDays} />
        ) : (
          <p className="mt-4 text-sm text-slate">
            Dispute window {escrowRates.disputeWindowDays} day{escrowRates.disputeWindowDays === 1 ? "" : "s"}. Only
            finance and admin staff can change this.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">AdorWorks mobile money accounts</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${collection.mtn_momo || collection.mgurush ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}
          >
            {[collection.mtn_momo && "MTN set", collection.mgurush && "mGurush set"].filter(Boolean).join(" · ") || "Not set yet"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          Where employers&rsquo; MTN MoMo and mGurush payments land. AdorWorks pays the talent their share and the commission
          (employer fee + talent fee) stays here — totals are on{" "}
          <a href="/operations/payouts" className="font-semibold text-teal-ink underline">Payouts</a>. When the live MTN
          connection is switched on, money goes to the account linked to AdorWorks&rsquo; MTN agreement, so keep this the same.
        </p>
        {canEdit ? (
          <CollectionAccountsForm current={collection} />
        ) : (
          <p className="mt-4 text-sm text-slate">
            MTN: {collection.mtn_momo ? `${collection.mtn_momo.accountName} · ${collection.mtn_momo.number}` : "not set"} · mGurush:{" "}
            {collection.mgurush ? `${collection.mgurush.accountName} · ${collection.mgurush.number}` : "not set"}. Only finance and
            admin staff can change these.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">Bank accounts for employer payments</h2>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${bankCurrencies.length ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}
          >
            {bankCurrencies.length ? `Bank transfer offered: ${bankCurrencies.join(", ")}` : "Not set — bank transfer hidden"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          AdorWorks&rsquo; own accounts that employers pay into when they choose bank transfer — one per currency, so an
          employer paying in SSP sees the SSP account and one paying in USD sees the USD account. Employers can send from
          any bank; this is only where the money lands. Confirm transfers as they arrive under{" "}
          <a href="/operations/invoices" className="font-semibold text-teal-ink underline">Invoices</a>.
        </p>

        {canEdit ? (
          <BankAccountForm current={bankAccounts} />
        ) : (
          <p className="mt-4 text-sm text-slate">
            {bankCurrencies.length ? `Accounts set for ${bankCurrencies.join(" and ")}.` : "No account saved yet."} Only
            finance and admin staff can change this.
          </p>
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">Exchange rate</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${fx ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}>
            {fx ? `1 USD = ${fx.usdToSsp.toLocaleString()} SSP` : "Not set"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          Shown to employers at checkout so they can see the amount in the other currency before paying (for information — payments
          stay in the milestone&rsquo;s currency).{fx?.updatedAt ? ` Last updated ${new Date(fx.updatedAt).toLocaleString("en-GB")}.` : ""} Update it when the bank rate moves.
        </p>
        {canEdit && <FxForm current={fx?.usdToSsp ?? null} />}
      </section>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">Employer Guarantee</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${guaranteeOn ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}>
            {guaranteeOn ? "Shown to employers" : "Off — draft wording, waiting for counsel"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          Full-time hires covered during probation (up to 90 days); contract talent, projects and services for 30 days. One
          replacement per role. Remedy now: {guaranteeRemedy(rates.enabled)} Requests appear on the Operations overview.
        </p>
        {canEdit && (
          <FeatureSwitchForm
            settingKey="guarantee"
            enabled={guaranteeOn}
            label="Show the Employer Guarantee to employers"
            warning="Only switch on once counsel has approved the Guarantee terms. Employers will see their window and a Request replacement button on each contract."
          />
        )}
      </section>

      <section className="mt-6 rounded-xl border border-slate/15 bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-bold text-midnight">Programme partners and consent</h2>
          <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${sharingOn ? "bg-teal/10 text-teal-ink" : "bg-slate/10 text-slate"}`}>
            {sharingOn ? "Consent screens live" : "Off — draft wording, waiting for counsel and translation check"}
          </span>
        </div>
        <p className="mt-2 text-sm text-slate">
          Partners only ever see group totals (never groups under 5). Named progress, earnings or stories are shared only for
          people who tick that box, and only after the partner signs the data-sharing agreement. Under-18s also need a
          guardian&rsquo;s consent, recorded here from the paper form. Data is kept for the programme plus up to 24 months.
        </p>
        {canEdit && (
          <FeatureSwitchForm
            settingKey="programme_sharing"
            enabled={sharingOn}
            label="Ask programme members for their sharing choices"
            warning="Only switch on once counsel has approved the consent wording and a native speaker has checked the Arabic and Swahili."
          />
        )}
        <PartnerOrgs orgs={partnerOrgOptions} canEdit={canEdit} />
        <ProgrammesPanel programmes={programmes} canEdit={canEdit} />
      </section>
    </div>
  );
}

/** Staff view of every programme, its members and each member's newest consent choice. */
async function loadProgrammes(): Promise<ProgrammeView[]> {
  const admin = createAdminClient();
  const { data: programmes } = await admin.from("programmes").select("*").order("created_at", { ascending: false });
  if (!programmes?.length) return [];
  const ids = programmes.map((p) => p.id);
  const [{ data: members }, { data: consents }, { data: partnerLinks }, { data: facilitatorRows }] = await Promise.all([
    admin.from("programme_members").select("*").in("programme_id", ids),
    admin.from("programme_consents").select("*").in("programme_id", ids).order("created_at", { ascending: false }),
    admin.from("programme_partner_users").select("programme_id, user_id").in("programme_id", ids),
    admin.from("programme_facilitators").select("programme_id, user_id, background_check_recorded_at, background_check_note").in("programme_id", ids),
  ]);
  const partnerIds = [...new Set([...(partnerLinks ?? []), ...(facilitatorRows ?? [])].map((l) => l.user_id))];
  const { data: partnerProfiles } = partnerIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", partnerIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const talentIds = [...new Set((members ?? []).map((m) => m.talent_id))];
  const { data: people } = talentIds.length
    ? await admin.from("talent_profiles").select("id, display_name").in("id", talentIds)
    : { data: [] as { id: string; display_name: string | null }[] };
  const { data: profiles } = talentIds.length
    ? await admin.from("profiles").select("id, full_name").in("id", talentIds)
    : { data: [] as { id: string; full_name: string | null }[] };
  const nameOf = (id: string) =>
    (people ?? []).find((p) => p.id === id)?.display_name || (profiles ?? []).find((p) => p.id === id)?.full_name || "Talent";
  const latest = new Map<string, NonNullable<typeof consents>[number]>();
  for (const c of consents ?? []) {
    const key = `${c.programme_id}:${c.talent_id}`;
    if (!latest.has(key)) latest.set(key, c);
  }
  return programmes.map((p) => ({
    id: p.id,
    name: p.name,
    partnerName: p.partner_name,
    agreementSignedAt: p.agreement_signed_at,
    endsOn: p.ends_on,
    programmeType: p.programme_type,
    joinCode: p.join_code,
    partnerUsers: (partnerLinks ?? [])
      .filter((l) => l.programme_id === p.id)
      .map((l) => (partnerProfiles ?? []).find((x) => x.id === l.user_id)?.full_name ?? "Partner user"),
    facilitators: (facilitatorRows ?? [])
      .filter((f) => f.programme_id === p.id)
      .map((f) => ({
        userId: f.user_id,
        name: (partnerProfiles ?? []).find((x) => x.id === f.user_id)?.full_name ?? "Facilitator",
        checkedAt: f.background_check_recorded_at,
        note: f.background_check_note,
      })),
    members: (members ?? [])
      .filter((m) => m.programme_id === p.id)
      .map((m) => {
        const c = latest.get(`${p.id}:${m.talent_id}`);
        return {
          talentId: m.talent_id,
          name: nameOf(m.talent_id),
          isMinor: m.is_minor,
          consent: c
            ? { named: c.share_named_progress, earnings: c.share_earnings, story: c.share_story, at: c.created_at, version: c.wording_version, guardian: c.guardian_name }
            : null,
        };
      }),
  }));
}
