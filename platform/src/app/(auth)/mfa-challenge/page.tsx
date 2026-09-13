import type { Metadata } from "next";
import { requireSessionWithoutMfaGate } from "@/lib/dal/session";
import { getVerifiedTotpFactorId } from "@/lib/actions/mfa";
import { MfaChallengeForm } from "./mfa-challenge-form";

export const metadata: Metadata = { title: "Verify your identity" };

// S04-08 — reached when a staff account already has a verified TOTP
// factor but this particular session hasn't completed a challenge yet
// (e.g. a fresh login). See src/lib/dal/session.ts's requireStaffMfa().
export default async function MfaChallengePage() {
  await requireSessionWithoutMfaGate();
  const factorId = await getVerifiedTotpFactorId();

  if (!factorId) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-midnight">No authenticator found</h1>
        <p className="mt-3 text-sm text-slate">
          Something&apos;s inconsistent with your account&apos;s two-factor setup. Contact another admin for help.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">Verify your identity</h1>
      <p className="mt-2 text-sm text-slate">Enter the 6-digit code from your authenticator app to continue.</p>
      <MfaChallengeForm factorId={factorId} />
    </div>
  );
}
