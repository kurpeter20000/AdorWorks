"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReviewTimesheet, type TimesheetReviewStatus } from "@/lib/domain/timesheetPermissions";
import { notifyUser, NOTIFICATION_TYPES } from "@/lib/domain/notifications";
import { sendEmailSafely, getUserEmail } from "@/lib/email";
import { renderEmail } from "@/lib/emailTemplate";
import { buildUnsubscribeUrl } from "@/lib/unsubscribeToken";

const ReviewTimesheetSchema = z.object({
  timesheetId: z.string().uuid(),
  status: z.enum(["approved", "rejected"]),
});

export async function reviewTimesheet(
  timesheetId: string,
  status: TimesheetReviewStatus
): Promise<{ error?: string }> {
  const input = ReviewTimesheetSchema.safeParse({ timesheetId, status });
  if (!input.success) return { error: "Invalid timesheet review." };

  const session = await requireSession();
  const admin = createAdminClient();

  const { data: timesheet, error: timesheetError } = await admin
    .from("timesheets")
    .select("id, contract_id, status")
    .eq("id", input.data.timesheetId)
    .maybeSingle();
  if (timesheetError) return { error: timesheetError.message };
  if (!timesheet) return { error: "Timesheet not found." };

  const { data: contract, error: contractError } = await admin
    .from("contracts")
    .select("id, organisation_id, talent_id, status")
    .eq("id", timesheet.contract_id)
    .maybeSingle();
  if (contractError) return { error: contractError.message };
  if (!contract) return { error: "Contract not found." };

  const { data: membership, error: membershipError } = await admin
    .from("organisation_members")
    .select("user_id, role")
    .eq("organisation_id", contract.organisation_id)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (membershipError) return { error: membershipError.message };

  if (
    !canReviewTimesheet({
      actorUserId: session.userId,
      talentUserId: contract.talent_id,
      organisationRole: membership?.role ?? null,
      contractStatus: contract.status,
      timesheetStatus: timesheet.status,
    })
  ) {
    return { error: "You do not have permission to review this timesheet." };
  }

  const { data: updated, error: updateError } = await admin
    .from("timesheets")
    .update({ status: input.data.status })
    .eq("id", timesheet.id)
    .eq("status", "submitted")
    .select("id")
    .maybeSingle();
  if (updateError) return { error: updateError.message };
  if (!updated) return { error: "This timesheet was already reviewed. Refresh and try again." };

  // S11-02: timesheet review previously had no user-facing notification at
  // all — the talent found out only by opening the contract page.
  await notifyUser(admin, {
    userId: contract.talent_id,
    type: NOTIFICATION_TYPES.TIMESHEET_REVIEWED,
    title: input.data.status === "approved" ? "Your timesheet was approved" : "Your timesheet was rejected",
    link: `/contracts/${contract.id}`,
    dedupeKey: timesheet.id,
  });
  const timesheetEmail = await getUserEmail(admin, contract.talent_id);
  await sendEmailSafely(
    timesheetEmail,
    input.data.status === "approved" ? "Your timesheet was approved on AdorWorks" : "Your timesheet was rejected on AdorWorks",
    renderEmail({
      heading: input.data.status === "approved" ? "Your timesheet was approved" : "Your timesheet was rejected",
      paragraphs: [
        input.data.status === "approved"
          ? "Your submitted timesheet was approved."
          : "Your submitted timesheet was rejected. Check the contract for details.",
      ],
      ctaLabel: "View contract",
      ctaUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/contracts/${contract.id}`,
      unsubscribeUrl: buildUnsubscribeUrl(contract.talent_id),
    }),
    { admin, recipientUserId: contract.talent_id }
  );

  revalidatePath(`/contracts/${contract.id}`);
  return {};
}
