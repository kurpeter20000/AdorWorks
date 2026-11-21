import { describe, it, expect } from "vitest";
import { checkOpportunity, type CheckableOpportunity } from "./opportunityChecks";

const base: CheckableOpportunity = {
  title: "Field data collector",
  brief: "Visit 40 households over 6 weeks and record survey answers on a tablet we provide.",
  payment_basis: "fixed",
  compensation_amount: 300000,
  compensation_min: null,
  compensation_max: null,
  currency: "SSP",
};
const byKey = (o: CheckableOpportunity, status: string | null = "verified") =>
  Object.fromEntries(checkOpportunity(o, status).map((c) => [c.key, c]));

describe("opportunity review checks", () => {
  it("passes a clean, paid post from a verified employer", () => {
    expect(checkOpportunity(base, "verified").every((c) => c.ok)).toBe(true);
  });

  it("accepts a min–max range but not 'negotiable' or no pay", () => {
    expect(byKey({ ...base, compensation_amount: null, compensation_min: 100, compensation_max: 200 }).pay.ok).toBe(true);
    expect(byKey({ ...base, payment_basis: "negotiable" }).pay.ok).toBe(false);
    expect(byKey({ ...base, compensation_amount: null }).pay.ok).toBe(false);
  });

  it("flags fees asked of talent", () => {
    for (const brief of ["A registration fee of SSP 5,000 applies.", "You must pay a deposit to start.", "Send the money to our agent first.", "Pay to apply."]) {
      expect(byKey({ ...base, brief }).no_fee.ok, brief).toBe(false);
    }
  });

  it("doesn't flag ordinary mentions of pay", () => {
    expect(byKey({ ...base, brief: "We pay SSP 300,000 in two milestones. Transport is covered." }).no_fee.ok).toBe(true);
  });

  it("flags phone numbers, emails and WhatsApp", () => {
    expect(byKey({ ...base, brief: "For questions call 0912 345 678." }).no_contact.ok).toBe(false);
    expect(byKey({ ...base, brief: "Call +211 912 345 678" }).no_contact.ok).toBe(false);
    expect(byKey({ ...base, brief: "Email jobs@example.org" }).no_contact.ok).toBe(false);
    expect(byKey({ ...base, brief: "Message us on WhatsApp" }).no_contact.ok).toBe(false);
  });

  it("doesn't mistake amounts or counts for phone numbers", () => {
    expect(byKey({ ...base, brief: "Visit 40 households. Budget SSP 300,000. Starts 2026-12-01." }).no_contact.ok).toBe(true);
    expect(byKey({ ...base, brief: "Budget SSP 2500000 for 12 months." }).no_contact.ok).toBe(true);
  });

  it("flags an employer that isn't verified", () => {
    expect(byKey(base, "pending").verified_employer.ok).toBe(false);
  });
});
