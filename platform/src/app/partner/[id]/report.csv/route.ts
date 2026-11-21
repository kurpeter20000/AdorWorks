import { createHash } from "crypto";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadParticipantFacts, partnerProgrammesFor } from "@/lib/dal/pathways";
import { buildPartnerReport, reportCheckCode } from "@/lib/domain/pathways";
import { logAuditEvent } from "@/lib/domain/audit";
import { DOMAIN_EVENTS } from "@/lib/domain/events";

const csvCell = (v: string | number) => {
  const s = String(v);
  // Quote, and neutralise formula injection in spreadsheet apps.
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/**
 * Donor report export (competitive brief): the same figures as the
 * dashboard, through the same privacy floor, with a check code a donor can
 * give AdorWorks to confirm the file is genuine (the export is recorded in
 * the audit log with its code).
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await requireSession();
  const programme = (await partnerProgrammesFor(session.userId, session.role)).find((p) => p.id === id);
  if (!programme) return new Response("Not found", { status: 404 });

  const admin = createAdminClient();
  const report = buildPartnerReport(await loadParticipantFacts(admin, id), programme.agreement_signed_at !== null);
  const generated = new Date().toISOString();

  const rows: (string | number)[][] = [
    ["AdorWorks programme report"],
    ["Programme", programme.name],
    ["Partner", programme.partner_name],
    ["Funder", programme.funder ?? ""],
    ["Region", programme.region ?? ""],
    ["Period", `${programme.starts_on ?? ""} to ${programme.ends_on ?? "ongoing"}`],
    ["Generated", generated],
    [],
  ];
  if (!report.visible) {
    rows.push(["Results are hidden until at least 5 people are enrolled."], ["Enrolled", report.members]);
  } else {
    rows.push(["Outcome funnel"], ...report.funnel.map((f) => [f.label, f.count]), []);
    rows.push(["Placed", report.placed], ["Target placed", programme.target_placed ?? ""]);
    for (const [c, v] of Object.entries(report.earnings)) rows.push([`Total earned (${c})`, v]);
    rows.push(["Median days to first paid work", report.medianDaysToFirstPay ?? "not enough data"], []);
    for (const b of report.breakdown) rows.push([b.by === "category" ? "By skill area" : "By location"], ...b.rows.map((r) => [r.value, r.count]), []);
    rows.push(["Participants who agreed to share their progress"], ["Name", "Placed", "Paid"]);
    for (const n of report.named) rows.push([n.name, n.placed ? "yes" : "no", n.paid ? "yes" : "no"]);
    rows.push(["Groups under 5 people are never shown. Names appear only with each person's consent."]);
  }
  const body = rows.map((r) => r.map(csvCell).join(",")).join("\n");
  const code = reportCheckCode(createHash("sha256").update(body).digest("hex"));
  const csv = `${body}\n${csvCell("Check code")},${csvCell(code)}\n`;

  await logAuditEvent(admin, {
    name: DOMAIN_EVENTS.PROGRAMME_UPDATED,
    actorId: session.userId,
    entityType: "programmes",
    entityId: id,
    source: "platform",
    metadata: { reason: "partner_report_exported", checkCode: code, generated },
  });

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="adorworks-report-${programme.name.replace(/[^A-Za-z0-9]+/g, "-").slice(0, 40)}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
