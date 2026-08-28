import "server-only";
import { isFeatureEnabled, FEATURE_FLAGS } from "./domain/featureFlags";
import { getPaymentProvider, type PaymentProvider } from "./paymentProviders";

/**
 * The real seam payMilestone() actually calls. Returns the real MTN
 * MoMo/m-Gurush implementation when ADORWORKS_FF_REAL_PAYMENTS is on (see
 * paymentProviders.real.ts — off by default, and there are no credentials
 * in this environment to have tested it against), otherwise the same
 * simulated provider getPaymentProvider() always returns. Card payments
 * are untouched by the flag — no card-processor decision has been made,
 * so visa_mastercard stays simulated either way.
 *
 * This lives in its own "server-only" file, separate from
 * paymentProviders.ts, deliberately: paymentProviders.ts is also imported
 * by the client component payment-checkout.tsx, and Turbopack's build
 * traces a dynamic import()'s target even when it's behind a runtime
 * flag — keeping the real module out of that file's import graph
 * entirely is what actually keeps it (and its network calls) out of the
 * client bundle, not the dynamic import alone.
 */
export async function getActivePaymentProvider(id: string): Promise<PaymentProvider | undefined> {
  if ((id === "mgurush" || id === "mtn_momo") && isFeatureEnabled(FEATURE_FLAGS.REAL_PAYMENTS)) {
    const { REAL_PAYMENT_PROVIDERS } = await import("./paymentProviders.real");
    return REAL_PAYMENT_PROVIDERS[id];
  }
  return getPaymentProvider(id);
}
