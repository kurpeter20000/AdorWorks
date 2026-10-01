import "server-only";
import { createHash } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { getFeeSettings } from "@/lib/dal/settings";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";
import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { buildTermsContent, termsFingerprint, type ContractTermsContent } from "@/lib/domain/contractTerms";
import type { ContractTermsRow } from "@/lib/database.types";

export type IssuedTerms = Omit<ContractTermsRow, "content"> & { content: ContractTermsContent };

/**
 * Makes sure the contract's current written terms are on record (0096)
 * and returns the latest version. A new version is stored only when what
 * was agreed actually changed; earlier versions are kept untouched as
 * evidence of the terms at the time.
 *
 * Callers must check the viewer may see this contract first — this runs
 * with the service role. Never throws: a failure returns null and the
 * page explains, rather than blocking the contract itself.
 */
export async function ensureContractTerms(contractId: string, actorId: string | null = null): Promise<IssuedTerms | null> {
  try {
    const admin = createAdminClient();
    const { data: contract } = await admin
      .from("contracts")
      .select("id, talent_id, organisation_id, opportunity_id, service_request_id, offer_id, started_at")
      .eq("id", contractId)
      .maybeSingle();
    if (!contract) return null;

    const [{ data: org }, { data: talent }, { data: milestones }, { data: offer }] = await Promise.all([
      admin.from("organisations").select("name, representative_id").eq("id", contract.organisation_id).maybeSingle(),
      admin.from("talent_profiles").select("legal_name, display_name").eq("id", contract.talent_id).maybeSingle(),
      admin.from("milestones").select("title, amount, currency, due_date, sequence").eq("contract_id", contract.id).order("sequence"),
      contract.offer_id ? admin.from("offers").select("payment_basis").eq("id", contract.offer_id).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    const { data: rep } = org?.representative_id
      ? await admin.from("profiles").select("full_name").eq("id", org.representative_id).maybeSingle()
      : { data: null };

    let work = { title: "AdorWorks engagement", description: null as string | null, engagementType: null as string | null, workMode: null as string | null, location: null as string | null };
    if (contract.opportunity_id) {
      const { data: o } = await admin
        .from("opportunities")
        .select("title, brief, engagement_type, work_mode, location")
        .eq("id", contract.opportunity_id)
        .maybeSingle();
      if (o) work = { title: o.title, description: o.brief, engagementType: o.engagement_type, workMode: o.work_mode, location: o.location };
    } else if (contract.service_request_id) {
      const { data: req } = await admin.from("service_requests").select("talent_service_id").eq("id", contract.service_request_id).maybeSingle();
      if (req) {
        const { data: s } = await admin.from("talent_services").select("title, deliverables").eq("id", req.talent_service_id).maybeSingle();
        if (s) work = { ...work, title: s.title, description: s.deliverables, engagementType: "service" };
      }
    }

    const content = buildTermsContent({
      contractId: contract.id,
      startedAt: contract.started_at,
      employer: { organisationName: org?.name ?? "Employer", representativeName: rep?.full_name ?? null },
      // The legal name is what written terms need; it is shown only to the
      // two parties and staff (contract_terms RLS), never publicly.
      talent: { name: talent?.legal_name || talent?.display_name || "Talent" },
      work: { ...work, paymentBasis: offer?.payment_basis ?? null },
      milestones: (milestones ?? []).map((m) => ({ title: m.title, amount: Number(m.amount), currency: m.currency, dueDate: m.due_date })),
      fees: await getFeeSettings(),
      cancellationPolicyUrl: `${MARKETING_SITE_URL}/cancellation-refunds.html`,
    });
    const hash = createHash("sha256").update(termsFingerprint(content)).digest("hex");

    const { data: latest } = await admin
      .from("contract_terms")
      .select("*")
      .eq("contract_id", contract.id)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latest && latest.content_hash === hash) return latest as IssuedTerms;

    const version = (latest?.version ?? 0) + 1;
    const { data: inserted, error } = await admin
      .from("contract_terms")
      .insert({ contract_id: contract.id, version, content, content_hash: hash })
      .select("*")
      .single();
    if (error) {
      // Two viewers opening the page at once: the other one won — read it back.
      if (error.code === "23505") {
        const { data: winner } = await admin.from("contract_terms").select("*").eq("contract_id", contract.id).eq("version", version).maybeSingle();
        return (winner as IssuedTerms) ?? null;
      }
      console.error(`[contractTerms] could not store terms for ${contract.id}:`, error.message);
      return null;
    }

    await logAuditEvent(admin, {
      name: DOMAIN_EVENTS.CONTRACT_TERMS_ISSUED,
      actorId,
      entityType: "contracts",
      entityId: contract.id,
      source: "platform",
      after: { version },
    });
    return inserted as IssuedTerms;
  } catch (err) {
    console.error(`[contractTerms] ensureContractTerms(${contractId}) failed:`, err);
    return null;
  }
}
