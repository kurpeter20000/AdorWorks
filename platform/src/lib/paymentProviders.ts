import { randomUUID } from "crypto";

/**
 * The swappable boundary for mobile-money settlement. Every provider
 * here is simulated — AdorWorks doesn't have a licensed payment partner
 * yet, and a real m-Gurush/MTN MoMo integration needs their official
 * APIs, a signed agreement, and legal approval before this interface
 * gets a non-simulated implementation. Nothing outside this file should
 * know or care that charge() doesn't call a real network.
 */
export interface PaymentProvider {
  id: "mgurush" | "mtn_momo";
  label: string;
  charge(args: { phone: string; amount: number; currency: string }): Promise<
    { success: true; reference: string } | { success: false; reason: string }
  >;
}

function mockProvider(id: PaymentProvider["id"], label: string, referencePrefix: string): PaymentProvider {
  return {
    id,
    label,
    async charge({ phone }) {
      if (!/^\+?[0-9]{9,15}$/.test(phone.replace(/\s/g, ""))) {
        return { success: false, reason: "That doesn't look like a valid phone number." };
      }
      return { success: true, reference: `${referencePrefix}-SIM-${randomUUID().slice(0, 8).toUpperCase()}` };
    },
  };
}

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  mockProvider("mgurush", "m-Gurush", "MGURUSH"),
  mockProvider("mtn_momo", "MTN Mobile Money", "MOMO"),
];

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
