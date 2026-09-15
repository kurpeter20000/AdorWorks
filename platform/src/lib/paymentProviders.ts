import { randomUUID, randomInt } from "crypto";

/**
 * The swappable boundary for payment settlement. Every provider here is
 * simulated — AdorWorks doesn't have a licensed payment partner yet, and
 * a real m-Gurush/MTN MoMo/card-processor integration needs their
 * official APIs, a signed agreement, and legal approval before this
 * interface gets a non-simulated implementation. Nothing outside this
 * file should know or care that charge() doesn't call a real network.
 *
 * S09-12 gap-check (2026-09-15): this used to accept a raw card number/
 * expiry/CVV and derive cardLast4/cardBrand from them — a real-looking
 * card form with no real processor behind it is exactly the shape of
 * thing a user might reflexively type a real card into. Since no real
 * card processor exists to tokenize against yet, the honest simulation is
 * to never ask for card digits at all — cardLast4/cardBrand are now
 * synthetic, generated here, not derived from anything the user typed. A
 * real integration replaces this whole file with one that tokenizes
 * client-side via the processor's own SDK, never with one that accepts a
 * raw card number through this action.
 */
export interface PaymentProvider {
  id: "mgurush" | "mtn_momo" | "visa_mastercard";
  label: string;
  method: "mobile_money" | "card";
  charge(args: { phone: string; amount: number; currency: string }): Promise<
    | { success: true; reference: string; cardLast4?: string; cardBrand?: string }
    | { success: false; reason: string }
  >;
}

function mockMobileMoneyProvider(id: "mgurush" | "mtn_momo", label: string, referencePrefix: string): PaymentProvider {
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

const mockCardProvider: PaymentProvider = {
  id: "visa_mastercard",
  label: "Visa / Mastercard",
  method: "card",
  async charge() {
    // No card data is collected anywhere in this simulation (S09-12) — a
    // synthetic last4/brand, not anything derived from user input.
    return {
      success: true,
      reference: `CARD-SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
      cardLast4: String(randomInt(1000, 10000)),
      cardBrand: randomInt(2) === 0 ? "Visa" : "Mastercard",
    };
  },
};

export const PAYMENT_PROVIDERS: PaymentProvider[] = [
  mockMobileMoneyProvider("mgurush", "m-Gurush", "MGURUSH"),
  mockMobileMoneyProvider("mtn_momo", "MTN Mobile Money", "MOMO"),
  mockCardProvider,
];

export function getPaymentProvider(id: string): PaymentProvider | undefined {
  return PAYMENT_PROVIDERS.find((p) => p.id === id);
}
