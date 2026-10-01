import { describe, expect, it } from "vitest";
import { buildTermsContent, termsFingerprint, type ContractTermsInput } from "./contractTerms";

const base: ContractTermsInput = {
  contractId: "c1",
  startedAt: "2026-10-01T09:00:00Z",
  employer: { organisationName: "Nile Youth Foundation", representativeName: "Achol Garang" },
  talent: { name: "Peter Lual" },
  work: { title: "Brand identity", description: "Logo and guide", engagementType: "freelance", workMode: "remote", location: "Juba", paymentBasis: "milestone" },
  milestones: [
    { title: "Concepts", amount: 300, currency: "SSP", dueDate: "2026-10-10" },
    { title: "Final files", amount: 500, currency: "SSP", dueDate: "2026-10-20" },
  ],
  fees: { enabled: false, employerPercent: 2.5, talentPercent: 7.5 },
  cancellationPolicyUrl: "https://adorworks.pages.dev/cancellation-refunds.html",
};

describe("buildTermsContent", () => {
  it("covers the s.44 particulars: parties, work, duration, remuneration", () => {
    const t = buildTermsContent(base);
    expect(t.parties.employer.organisation).toBe("Nile Youth Foundation");
    expect(t.parties.talent.name).toBe("Peter Lual");
    expect(t.work.title).toBe("Brand identity");
    expect(t.duration.start).toBe("2026-10-01T09:00:00Z");
    expect(t.duration.end).toBe("2026-10-20");
    expect(t.remuneration.total).toBe(800);
    expect(t.remuneration.milestones).toHaveLength(2);
    expect(t.legalNote).toMatch(/section 44/);
  });

  it("has no end date when no milestone has one", () => {
    const t = buildTermsContent({ ...base, milestones: [{ title: "All", amount: 100, currency: "SSP", dueDate: null }] });
    expect(t.duration.end).toBeNull();
  });
});

describe("termsFingerprint", () => {
  it("changes when what was agreed changes", () => {
    const a = termsFingerprint(buildTermsContent(base));
    const b = termsFingerprint(buildTermsContent({ ...base, milestones: [{ ...base.milestones[0], amount: 350 }, base.milestones[1]] }));
    expect(a).not.toBe(b);
  });

  it("ignores platform fee switches, so terms aren't re-issued for them", () => {
    const a = termsFingerprint(buildTermsContent(base));
    const b = termsFingerprint(buildTermsContent({ ...base, fees: { enabled: true, employerPercent: 2.5, talentPercent: 7.5 } }));
    expect(a).toBe(b);
  });
});
