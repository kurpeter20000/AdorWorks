import type { Metadata } from "next";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { getFeeRates } from "@/lib/dal/settings";
import { calculateFees } from "@/lib/domain/fees";
import { StatePanel } from "@/components/state-panel";
import { FeeSettingsForm } from "./fee-settings-form";

export const metadata: Metadata = { title: "Settings — Operations" };

export default async function OperationsSettingsPage() {
  const session = await requireRole(...STAFF_ROLES);
  const rates = await getFeeRates();
  const canEdit = session.role === "finance" || session.role === "admin";
  const example = calculateFees(10000, { ...rates, enabled: true });

  return (
    <div className="max-w-2xl">
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
    </div>
  );
}
