import Link from "next/link";
import { Clock, CircleAlert } from "lucide-react";
import type { VerifiedSession } from "@/lib/dal/session";
import { needsApproval } from "@/lib/domain/approval";
import { getT } from "@/i18n/server";

/**
 * Shown on every page to a new talent or employer account until staff
 * approve it (0128) — what's happening, how long, and what to do
 * meanwhile. A declined account sees the reason and a way to reply.
 */
export async function ApprovalBanner({ session }: { session: VerifiedSession }) {
  if (!needsApproval(session.role) || session.approvalStatus === "approved") return null;
  const t = await getT();
  const isTalent = session.role === "talent";

  if (session.approvalStatus === "declined") {
    return (
      <div role="alert" className="border-b border-coral/30 bg-coral/5">
        <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-coral-ink" aria-hidden />
          <div className="min-w-0 text-pretty">
            <p className="font-bold text-midnight">{t("We couldn't approve your account")}</p>
            {session.approvalNote && (
              <p className="mt-0.5 text-slate">
                {t("Reason:")} <span className="no-i18n">{session.approvalNote}</span>
              </p>
            )}
            <p className="mt-1">
              <Link href="/support" className="font-bold text-teal-ink underline">
                {t("Message support")}
              </Link>{" "}
              <span className="text-slate">{t("if you think this is a mistake or can share more information.")}</span>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div role="status" className="border-b border-amber-tint bg-amber-tint/60">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-3 text-sm">
        <Clock className="mt-0.5 size-5 shrink-0 text-warning-ink" aria-hidden />
        <div className="min-w-0 text-pretty">
          <p className="font-bold text-midnight">{t("Your account is waiting for approval")}</p>
          <p className="mt-0.5 text-slate">
            {isTalent
              ? t("Our team checks every new account, usually within 2 business days. Meanwhile, finish your Passport and upload your ID so we can verify you. You can apply for work once you're approved.")
              : t("Our team checks every new account, usually within 2 business days. Meanwhile, set up your organisation and its verification details. You can send jobs for review once you're approved.")}
          </p>
          <p className="mt-1">
            <Link href={isTalent ? "/onboarding" : "/organisation"} className="font-bold text-teal-ink underline">
              {isTalent ? t("Finish your profile") : t("Set up your organisation")}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
