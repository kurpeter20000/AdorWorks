import "server-only";
import { randomUUID } from "crypto";
import type { PaymentProvider } from "./paymentProviders";

/**
 * Real (untested) adapter implementations for the two named mobile-money
 * providers — gated behind ADORWORKS_FF_REAL_PAYMENTS (off by default,
 * see featureFlags.ts). Never imported by client code, and never
 * imported eagerly even server-side — paymentProviders.ts's
 * getActivePaymentProvider() only loads this module via a dynamic
 * import() when the flag is actually on, so this file (and its network
 * calls) has zero effect on the app while the flag stays off, which is
 * the default and the only state anyone should run this in without
 * having tested it against a real sandbox first.
 *
 * No credentials exist in this environment, so NEITHER implementation
 * below has been exercised against a live API:
 *
 * - MTN MoMo: implemented against MTN's publicly documented Open API
 *   (Collections product — OAuth2 client-credentials token, then an
 *   async request-to-pay + short poll). This is a best-effort starting
 *   point from public documentation, not a verified integration —
 *   expect to debug real edge cases (rate limits, exact error shapes,
 *   sandbox-vs-production URL differences) once real credentials exist.
 * - m-Gurush: deliberately a stub, not a real implementation. There is
 *   no reliable public API documentation for this provider available to
 *   write against — inventing a plausible-looking request/response shape
 *   would be fabricating an integration, which is exactly what this
 *   stage's own guardrails rule out. Replace mgurushReal below once
 *   AdorWorks has m-Gurush's actual API documentation or a signed
 *   integration agreement.
 */

const mtnMomoReal: PaymentProvider = {
  id: "mtn_momo",
  label: "MTN Mobile Money",
  method: "mobile_money",
  async charge({ phone, amount, currency }) {
    const baseUrl = process.env.MTN_MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com";
    const subscriptionKey = process.env.MTN_MOMO_SUBSCRIPTION_KEY;
    const apiUser = process.env.MTN_MOMO_API_USER;
    const apiKey = process.env.MTN_MOMO_API_KEY;
    const targetEnvironment = process.env.MTN_MOMO_TARGET_ENVIRONMENT || "sandbox";

    if (!subscriptionKey || !apiUser || !apiKey) {
      return { success: false, reason: "MTN MoMo is not configured — missing MTN_MOMO_* environment variables." };
    }

    try {
      const tokenResponse = await fetch(`${baseUrl}/collection/token/`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString("base64")}`,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
        },
      });
      if (!tokenResponse.ok) {
        return { success: false, reason: `Could not authenticate with MTN MoMo (${tokenResponse.status}).` };
      }
      const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

      // X-Reference-Id is MTN's own idempotency key for this request —
      // generated fresh per charge() call, same as our own
      // payment_intentions row is created fresh per attempt.
      const referenceId = randomUUID();
      const requestToPayResponse = await fetch(`${baseUrl}/collection/v1_0/requesttopay`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "X-Reference-Id": referenceId,
          "X-Target-Environment": targetEnvironment,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          amount: String(amount),
          currency,
          externalId: referenceId,
          payer: { partyIdType: "MSISDN", partyId: phone.replace(/[^0-9]/g, "") },
          payerMessage: "AdorWorks milestone payment",
          payeeNote: "AdorWorks milestone payment",
        }),
      });
      if (requestToPayResponse.status !== 202) {
        return { success: false, reason: `MTN MoMo declined the payment request (${requestToPayResponse.status}).` };
      }

      // request-to-pay is asynchronous — the customer approves on their
      // phone, so this polls briefly rather than assuming immediate
      // settlement. Bounded (not indefinite) so a slow/ignored prompt
      // fails cleanly instead of hanging the request forever.
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`${baseUrl}/collection/v1_0/requesttopay/${referenceId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Target-Environment": targetEnvironment,
            "Ocp-Apim-Subscription-Key": subscriptionKey,
          },
        });
        if (!statusResponse.ok) continue;
        const body = (await statusResponse.json()) as { status?: string; reason?: string };
        if (body.status === "SUCCESSFUL") return { success: true, reference: referenceId };
        if (body.status === "FAILED") return { success: false, reason: body.reason || "MTN MoMo reported the payment failed." };
      }
      return {
        success: false,
        reason: "The customer hasn't approved this on their phone yet — ask them to check for the MTN MoMo prompt and try again.",
      };
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : "MTN MoMo request failed." };
    }
  },
};

const mgurushReal: PaymentProvider = {
  id: "mgurush",
  label: "m-Gurush",
  method: "mobile_money",
  async charge() {
    return {
      success: false,
      reason: "m-Gurush isn't connected yet — AdorWorks doesn't have their API documentation or a signed agreement.",
    };
  },
};

export const REAL_PAYMENT_PROVIDERS: Record<"mgurush" | "mtn_momo", PaymentProvider> = {
  mgurush: mgurushReal,
  mtn_momo: mtnMomoReal,
};
