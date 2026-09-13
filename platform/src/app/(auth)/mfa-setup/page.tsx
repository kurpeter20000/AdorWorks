import type { Metadata } from "next";
import { requireSessionWithoutMfaGate } from "@/lib/dal/session";
import { startMfaEnrollment } from "@/lib/actions/mfa";
import { MfaSetupForm } from "./mfa-setup-form";

export const metadata: Metadata = { title: "Set up two-factor authentication" };

// S04-08 — every staff account (reviewer/matcher/finance/admin) lands
// here on first login until a verified TOTP factor exists; see
// src/lib/dal/session.ts's requireStaffMfa(). Uses
// requireSessionWithoutMfaGate() rather than requireSession() — this
// page IS the gate, calling the gated version would redirect back here
// forever.
export default async function MfaSetupPage() {
  const session = await requireSessionWithoutMfaGate();
  const enrollment = await startMfaEnrollment();

  if (!enrollment.ok) {
    return (
      <div>
        <h1 className="text-2xl font-bold text-midnight">Couldn&apos;t start setup</h1>
        <p className="mt-3 text-sm text-coral-ink">{enrollment.error}</p>
        <p className="mt-3 text-sm text-slate">Refresh this page to try again, or contact another admin if this persists.</p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold text-midnight">Set up two-factor authentication</h1>
      <p className="mt-2 text-sm text-slate">
        Staff accounts like {session.fullName ?? "yours"} require an authenticator app before you can continue —
        this protects the sensitive data staff can see across every AdorWorks user.
      </p>
      <MfaSetupForm factorId={enrollment.factorId} qrCode={enrollment.qrCode} secret={enrollment.secret} />
    </div>
  );
}
