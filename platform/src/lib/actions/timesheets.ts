"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/dal/session";
import { createAdminClient } from "@/lib/supabase/admin";
import { canReviewTimesheet, type TimesheetReviewStatus } from "@/lib/domain/timesheetPermissions";

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
    .select("user_id")
    .eq("organisation_id", contract.organisation_id)
    .eq("user_id", session.userId)
    .maybeSingle();
  if (membershipError) return { error: membershipError.message };

  if (
    !canReviewTimesheet({
      actorUserId: session.userId,
      talentUserId: contract.talent_id,
      hasOrganisationMembership: !!membership,
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

  revalidatePath(`/contracts/${contract.id}`);
  return {};
}
