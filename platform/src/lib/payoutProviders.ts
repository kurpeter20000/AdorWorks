import { randomUUID } from "crypto";

/**
 * The swappable boundary for escrow release disbursements (Stage 16 step
 * 4) — the other direction from paymentProviders.ts's charge(): this
 * moves money OUT to the talent's phone, not in from the employer's.
 * Simulated here for the same reason paymentProviders.ts is simulated by
 * default: no real money moves until REAL_PAYMENTS is on, same flag,
 * same seam shape (see payoutProviders.server.ts).
 */
export interface PayoutProvider {
  id: "mtn_momo";
  label: string;
  payout(args: { phone: string; amount: number; currency: string }): Promise<
    { success: true; reference: string } | { success: false; reason: string }
  >;
}

const mockMtnMomoPayout: PayoutProvider = {
  id: "mtn_momo",
  label: "MTN Mobile Money",
  async payout({ phone }) {
    if (!/^\+?[0-9]{9,15}$/.test(phone.replace(/\s/g, ""))) {
      return { success: false, reason: "That doesn't look like a valid phone number." };
    }
    return { success: true, reference: `PAYOUT-SIM-${randomUUID().slice(0, 8).toUpperCase()}` };
  },
};

export const PAYOUT_PROVIDERS: PayoutProvider[] = [mockMtnMomoPayout];

export function getPayoutProvider(id: string): PayoutProvider | undefined {
  return PAYOUT_PROVIDERS.find((p) => p.id === id);
}
