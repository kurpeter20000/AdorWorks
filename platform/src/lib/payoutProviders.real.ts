import "server-only";
import { randomUUID } from "crypto";
import type { PayoutProvider } from "./payoutProviders";

/**
 * Real MTN MoMo Disbursements (transfer) adapter — gated behind
 * ADORWORKS_FF_REAL_PAYMENTS, same seam shape as paymentProviders.real.ts
 * (see payoutProviders.server.ts). Verified live against MTN's sandbox
 * (Stage 16 step 4, 2026-10-01) — token auth, transfer, and polling all
 * confirmed working end to end. Disbursements is a separate MTN product
 * from Collections, with its own subscription key and API user even in
 * sandbox — do not reuse the MTN_MOMO_COLLECTION_* credentials here.
 */
const mtnMomoPayoutReal: PayoutProvider = {
  id: "mtn_momo",
  label: "MTN Mobile Money",
  async payout({ phone, amount, currency }) {
    const baseUrl = process.env.MTN_MOMO_BASE_URL || "https://sandbox.momodeveloper.mtn.com";
    const subscriptionKey = process.env.MTN_MOMO_DISBURSEMENT_SUBSCRIPTION_KEY;
    const apiUser = process.env.MTN_MOMO_DISBURSEMENT_API_USER;
    const apiKey = process.env.MTN_MOMO_DISBURSEMENT_API_KEY;
    const targetEnvironment = process.env.MTN_MOMO_TARGET_ENVIRONMENT || "sandbox";

    if (!subscriptionKey || !apiUser || !apiKey) {
      return { success: false, reason: "MTN MoMo Disbursements is not configured — missing MTN_MOMO_DISBURSEMENT_* environment variables." };
    }

    try {
      const tokenResponse = await fetch(`${baseUrl}/disbursement/token/`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(`${apiUser}:${apiKey}`).toString("base64")}`,
          "Ocp-Apim-Subscription-Key": subscriptionKey,
        },
      });
      if (!tokenResponse.ok) {
        return { success: false, reason: `Could not authenticate with MTN MoMo Disbursements (${tokenResponse.status}).` };
      }
      const { access_token: accessToken } = (await tokenResponse.json()) as { access_token: string };

      const referenceId = randomUUID();
      const transferResponse = await fetch(`${baseUrl}/disbursement/v1_0/transfer`, {
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
          payee: { partyIdType: "MSISDN", partyId: phone.replace(/[^0-9]/g, "") },
          payerMessage: "AdorWorks escrow release",
          payeeNote: "AdorWorks escrow release",
        }),
      });
      if (transferResponse.status !== 202) {
        return { success: false, reason: `MTN MoMo declined the payout request (${transferResponse.status}).` };
      }

      // Same bounded-poll shape as the Collections adapter — a transfer
      // is asynchronous on MTN's side too.
      for (let attempt = 0; attempt < 10; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
        const statusResponse = await fetch(`${baseUrl}/disbursement/v1_0/transfer/${referenceId}`, {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "X-Target-Environment": targetEnvironment,
            "Ocp-Apim-Subscription-Key": subscriptionKey,
          },
        });
        if (!statusResponse.ok) continue;
        const body = (await statusResponse.json()) as { status?: string; reason?: string };
        if (body.status === "SUCCESSFUL") return { success: true, reference: referenceId };
        if (body.status === "FAILED") return { success: false, reason: body.reason || "MTN MoMo reported the payout failed." };
      }
      return { success: false, reason: "MTN MoMo hasn't confirmed this payout yet — try releasing it again shortly." };
    } catch (err) {
      return { success: false, reason: err instanceof Error ? err.message : "MTN MoMo payout request failed." };
    }
  },
};

export const REAL_PAYOUT_PROVIDERS: Record<"mtn_momo", PayoutProvider> = {
  mtn_momo: mtnMomoPayoutReal,
};
