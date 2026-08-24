import { randomUUID } from "crypto";

/**
 * The swappable boundary for payment settlement. Every provider here is
 * simulated — AdorWorks doesn't have a licensed payment partner yet, and
 * a real m-Gurush/MTN MoMo/card-processor integration needs their
 * official APIs, a signed agreement, and legal approval before this
 * interface gets a non-simulated implementation. Nothing outside this
 * file should know or care that charge() doesn't call a real network —
 * or, for cards, that no real processor ever sees a card number (a real
 * integration would tokenize client-side via the processor's own SDK
 * rather than ever passing a raw card number through this action at
 * all; this simulation accepts one directly only because there's no SDK
 * to integrate against yet).
 */
export interface PaymentProvider {
  id: "mgurush" | "mtn_momo" | "visa_mastercard";
  label: string;
  method: "mobile_money" | "card";
  charge(args: {
    phone: string;
    amount: number;
    currency: string;
    card?: { number: string; expiry: string; cvv: string };
  }): Promise<
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

function guessCardBrand(digits: string): string {
  if (digits.startsWith("4")) return "Visa";
  if (/^5[1-5]/.test(digits) || /^2[2-7]/.test(digits)) return "Mastercard";
  return "Card";
}

const mockCardProvider: PaymentProvider = {
  id: "visa_mastercard",
  label: "Visa / Mastercard",
  method: "card",
  async charge({ card }) {
    if (!card) return { success: false, reason: "Enter card details." };
    const digits = card.number.replace(/\s/g, "");
    if (!/^[0-9]{13,19}$/.test(digits)) {
      return { success: false, reason: "Enter a valid card number." };
    }
    const [month, year] = card.expiry.split("/").map((s) => s.trim());
    const expMonth = Number(month);
    const expYear = Number(year?.length === 2 ? `20${year}` : year);
    if (!expMonth || !expYear || expMonth < 1 || expMonth > 12) {
      return { success: false, reason: "Enter a valid expiry date (MM/YY)." };
    }
    const now = new Date();
    if (expYear < now.getFullYear() || (expYear === now.getFullYear() && expMonth < now.getMonth() + 1)) {
      return { success: false, reason: "This card has expired." };
    }
    if (!/^[0-9]{3,4}$/.test(card.cvv.trim())) {
      return { success: false, reason: "Enter a valid CVV." };
    }
    return {
      success: true,
      reference: `CARD-SIM-${randomUUID().slice(0, 8).toUpperCase()}`,
      cardLast4: digits.slice(-4),
      cardBrand: guessCardBrand(digits),
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
