import { describe, it, expect } from "vitest";
import { buildPartnerReport, newJoinCode, participantProgress, reportCheckCode, type ParticipantFacts } from "./pathways";

const person = (i: number, extra: Partial<ParticipantFacts> = {}): ParticipantFacts => ({
  talentId: `t-${i}`,
  name: `Person ${i}`,
  isMinor: false,
  joinedAt: "2026-10-01T00:00:00Z",
  tier: "registered",
  passportComplete: false,
  portfolioReviewed: false,
  location: "Juba",
  category: "creative_media",
  matched: false,
  placed: false,
  firstPaidAt: null,
  earnings: {},
  consent: null,
  ...extra,
});

describe("partner report privacy floor", () => {
  it("shows nothing at all for a cohort under 5", () => {
    const r = buildPartnerReport([1, 2, 3, 4].map((i) => person(i, { consent: { named: true, earnings: true, story: true, guardian: null } })), true);
    expect(r.visible).toBe(false);
    expect(r.named).toEqual([]);
    expect(r.funnel).toEqual([]);
  });

  it("never names anyone without consent and a signed agreement, and minors also need a guardian", () => {
    const yes = { named: true, earnings: false, story: false, guardian: null };
    const people = [
      person(1, { consent: yes }),
      person(2, { consent: { ...yes, named: false } }),
      person(3),
      person(4, { isMinor: true, consent: yes }),
      person(5, { isMinor: true, consent: { ...yes, guardian: "Mary Deng" } }),
    ];
    expect(buildPartnerReport(people, false).named).toEqual([]);
    expect(buildPartnerReport(people, true).named.map((n) => n.talentId)).toEqual(["t-1", "t-5"]);
  });

  it("shares earnings only for people who ticked that box", () => {
    const people = [1, 2, 3, 4, 5].map((i) =>
      person(i, { earnings: { SSP: 1000 }, consent: { named: true, earnings: i === 1, story: false, guardian: null } })
    );
    const r = buildPartnerReport(people, true);
    expect(r.named.find((n) => n.talentId === "t-1")?.earnings).toEqual({ SSP: 1000 });
    expect(r.named.find((n) => n.talentId === "t-2")?.earnings).toBeNull();
    expect(r.earnings).toEqual({ SSP: 5000 });
  });

  it("folds small groups into Other in breakdowns", () => {
    const people = [
      ...[1, 2, 3, 4, 5, 6].map((i) => person(i, { location: "Juba" })),
      person(7, { location: "Wau" }),
      person(8, { location: "Yei" }),
    ];
    const loc = buildPartnerReport(people, false).breakdown.find((b) => b.by === "location")!.rows;
    expect(loc).toEqual([{ value: "Juba", count: 6 }]);
  });

  it("builds the outcome funnel and hides a median over fewer than 5 people", () => {
    const people = [1, 2, 3, 4, 5].map((i) =>
      person(i, { tier: i <= 3 ? "adorverified" : "identity_verified", matched: i <= 2, placed: i === 1, firstPaidAt: i === 1 ? "2026-10-11T00:00:00Z" : null })
    );
    const r = buildPartnerReport(people, false);
    expect(r.funnel.map((f) => f.count)).toEqual([5, 5, 3, 2, 1, 1]);
    expect(r.medianDaysToFirstPay).toBeNull();
  });
});

describe("pathways helpers", () => {
  it("makes readable join codes", () => {
    expect(newJoinCode("EduPower Youth", () => 0)).toBe("EDUP-AAAA");
  });
  it("lists the participant checklist in order", () => {
    const steps = participantProgress({ passportComplete: true, portfolioReviewed: false, tier: "adorverified", placed: false, firstPaidAt: null });
    expect(steps.map((s) => s.done)).toEqual([true, false, true, false, false]);
  });
  it("formats a check code", () => {
    expect(reportCheckCode("abcdef0123456789")).toBe("ABCD-EF01-2345");
  });
});
