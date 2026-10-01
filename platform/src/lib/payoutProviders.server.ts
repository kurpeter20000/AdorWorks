import "server-only";
import { isFeatureEnabled, FEATURE_FLAGS } from "./domain/featureFlags";
import { getPayoutProvider, type PayoutProvider } from "./payoutProviders";

/**
 * The real seam releaseEscrowedPayment() actually calls. Same shape as
 * paymentProviders.server.ts: returns the real MTN MoMo Disbursements
 * implementation when ADORWORKS_FF_REAL_PAYMENTS is on, otherwise the
 * simulated provider. Kept in its own "server-only" file so the real
 * module (and its network calls) never reaches a client bundle — nothing
 * here is imported by client code today, but the separation matches the
 * payment-side precedent rather than relying on "nobody happens to
 * import this from a client component yet."
 */
export async function getActivePayoutProvider(id: string): Promise<PayoutProvider | undefined> {
  if (id === "mtn_momo" && isFeatureEnabled(FEATURE_FLAGS.REAL_PAYMENTS)) {
    const { REAL_PAYOUT_PROVIDERS } = await import("./payoutProviders.real");
    return REAL_PAYOUT_PROVIDERS[id];
  }
  return getPayoutProvider(id);
}
