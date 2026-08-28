/**
 * AdorWorks' platform fee (Stage 7). Approved decision for this pass:
 * 0%, but the real gross/fee/net calculation and its disclosure exist
 * now rather than being left unbuilt until a rate is set — change this
 * one constant (nothing else) when a real rate is approved.
 *
 * The fee is modeled as a deduction from the talent's payout (gross
 * charged to the employer stays the milestone's own amount; net is what
 * the talent receives after the platform's cut) — the common marketplace
 * convention, and the one that requires no change to what an employer is
 * already charged.
 */
export const PLATFORM_FEE_PERCENT = 0;

export interface FeeBreakdown {
  grossAmount: number;
  feePercent: number;
  feeAmount: number;
  netAmount: number;
}

export function calculateFee(grossAmount: number, feePercent: number = PLATFORM_FEE_PERCENT): FeeBreakdown {
  const feeAmount = Math.round(grossAmount * (feePercent / 100) * 100) / 100;
  const netAmount = Math.round((grossAmount - feeAmount) * 100) / 100;
  return { grossAmount, feePercent, feeAmount, netAmount };
}
