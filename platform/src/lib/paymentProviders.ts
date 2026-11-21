import { randomUUID } from "crypto";

/**
 * The swappable boundary for mobile-money settlement. Every provider here
 * is simulated; the real MTN MoMo / mGurush adapters (paymentProviders.real.ts)
 * are only used when ADORWORKS_FF_REAL_PAYMENTS is on (see
 * paymentProviders.server.ts). Nothing outside these files should know or
 * care whether charge() called a real network.
 *
 * Payment partners (owner decision, 2026-11-21): MTN Mobile Money (the
 * default), mGurush, and bank transfer from any bank. Bank transfer isn't
 * a charge() at all — the employer sends the money themselves and finance
 * staff confirm it when it lands (lib/actions/bankTransfers.ts) — so it
 * isn't listed here. Card was a simulation only and is no longer offered
 * (S09-12 had already removed every card field); old 'visa_mastercard'
 * rows still display on receipts.
 */
export interface PaymentProvider {
  id: "mtn_momo" | "mgurush";
  label: string;
  method: "mobile_money";
  charge(args: { phone: string; amount: number; currency: string }): Promise<
    { success: true; reference: string } | { success: false; reason: string }
  >;
}

function mockMobileMoneyProvider(id: PaymentProvider["id"], label: string, referencePrefix: string): PaymentProvider {
  return {
    id,
    label,
    method: "mobile_money",
    async charge({ phone }) {
      if (!/^\+?[0-9]{9,15}$/.test(phone.replace(/\s/g, ""))) {
        return { success: false, reason: "That doesn't look like a valid phone number." };
      }
      return { success: true, reference: `${referencePrefix}-SIM-${randomUUID().slice(0, 8).toUpperCase()}` };
    },
  };
}

/** MTN first: it's the default choice at checkout. */
export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  mockMobileMoneyProvider("mtn_momo", "MTN Mobile Money", "MOMO"),
  mockMobileMoneyProvider("mgurush", "mGurush", "MGURUSH"),
];

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
