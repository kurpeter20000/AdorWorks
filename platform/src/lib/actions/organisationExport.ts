"use server";

import { getMyOrganisationMembership } from "@/lib/dal/organisation";
import { requireRole, STAFF_ROLES } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";

function csvCell(value: unknown): string {
  const s = value === null || value === undefined ? "" : String(value);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
}

/**
 * Compliance export (Stage 16 step 5) — an org's own contract/payment
 * records as a CSV, for donor/audit reporting. Institutional orgs in
 * particular need to show funders exactly what was spent and on what;
 * this is the same underlying data already visible one contract at a
 * time on /contracts, just flattened into one downloadable file.
 *
 * Any org member can export their own org's records (not just
 * admins/the representative) — this is read-only reporting, not a
 * sensitive action, same visibility bar as viewing a contract itself.
 * Staff can export any organisation's records by id, for support
 * requests ("can you resend our Q3 export").
 */
export async function exportOrganisationRecords(organisationId?: string): Promise<{ csv: string; filename: string } | { message: string }> {
  let targetOrgId = organisationId;
  if (!targetOrgId) {
    const membership = await getMyOrganisationMembership();
    if (!membership) return { message: "You aren't part of an organisation." };
    targetOrgId = membership.org.id;
  } else {
    const membership = await getMyOrganisationMembership();
    const isOwnOrg = membership?.org.id === targetOrgId;
    if (!isOwnOrg) await requireRole(...STAFF_ROLES);
  }

  const admin = createAdminClient();
  const { data: org } = await admin.from("organisations").select("name").eq("id", targetOrgId).maybeSingle();
  if (!org) return { message: "Organisation not found." };

  const { data: contracts } = await admin
    .from("contracts")
    .select("id, status, talent_id, created_at")
    .eq("organisation_id", targetOrgId);
  const contractIds = (contracts ?? []).map((c) => c.id);
  if (contractIds.length === 0) {
    return { csv: toCsv(["No data"], []), filename: `adorworks-export-${targetOrgId}.csv` };
  }

  const { data: milestones } = await admin.from("milestones").select("id, contract_id, title, amount, currency, status").in("contract_id", contractIds);
  const { data: payments } = await admin
    .from("payment_events")
    .select("milestone_id, contract_id, receipt_number, amount, currency, total_charged, net_amount, provider_name, status, escrow_status, created_at, disbursed_at")
    .in("contract_id", contractIds);
  const { data: talentProfiles } = await admin
    .from("talent_profiles")
    .select("id, display_name")
    .in("id", [...new Set((contracts ?? []).map((c) => c.talent_id))]);
  const talentNameById = new Map((talentProfiles ?? []).map((t) => [t.id, t.display_name]));
  const paymentByMilestone = new Map((payments ?? []).map((p) => [p.milestone_id, p]));

  const headers = [
    "Contract ID",
    "Contract status",
    "Contract created",
    "Talent",
    "Milestone",
    "Milestone amount",
    "Currency",
    "Milestone status",
    "Receipt number",
    "Total charged",
    "Net paid to talent",
    "Payment provider",
    "Payment status",
    "Escrow status",
    "Paid on",
    "Released on",
  ];

  const rows = (milestones ?? []).map((m) => {
    const contract = (contracts ?? []).find((c) => c.id === m.contract_id);
    const payment = paymentByMilestone.get(m.id);
    return [
      m.contract_id,
      contract?.status ?? "",
      contract ? contract.created_at.slice(0, 10) : "",
      contract ? (talentNameById.get(contract.talent_id) ?? "") : "",
      m.title,
      m.amount,
      m.currency,
      m.status,
      payment?.receipt_number ?? "",
      payment?.total_charged ?? "",
      payment?.net_amount ?? "",
      payment?.provider_name ?? "",
      payment?.status ?? "",
      payment?.escrow_status ?? "",
      payment?.created_at ? payment.created_at.slice(0, 10) : "",
      payment?.disbursed_at ? payment.disbursed_at.slice(0, 10) : "",
    ];
  });

  const safeName = org.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  return { csv: toCsv(headers, rows), filename: `adorworks-${safeName}-${new Date().toISOString().slice(0, 10)}.csv` };
}
