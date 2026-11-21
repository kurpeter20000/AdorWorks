import { describe, it, expect } from "vitest";
import { parseAmount, readStatement, reconcile, type LedgerEntry } from "./reconciliation";
import { compareNames } from "./nameCheck";

describe("statement reading", () => {
  it("finds columns by name and reads money in and out", () => {
    const csv = `Date,Transaction ID,Description,Credit,Debit
2026-11-20,MOMO-SIM-AB12CD34,Payment from employer,"10,250.00",
2026-11-21,PAYOUT-SIM-99XX,Payout to talent,,"9,250.00"`;
    const r = readStatement(csv);
    if ("error" in r) throw new Error(r.error);
    expect(r.lines).toEqual([
      { row: 2, date: "2026-11-20", reference: "MOMO-SIM-AB12CD34", amount: 10250, direction: "in", description: "Payment from employer" },
      { row: 3, date: "2026-11-21", reference: "PAYOUT-SIM-99XX", amount: 9250, direction: "out", description: "Payout to talent" },
    ]);
  });

  it("understands a single signed amount column", () => {
    const r = readStatement("Reference,Amount\nAB1234,-500\nCD5678,700");
    if ("error" in r) throw new Error(r.error);
    expect(r.lines.map((l) => l.direction)).toEqual(["out", "in"]);
  });

  it("explains a file it can't read", () => {
    expect(readStatement("Foo,Bar\n1,2")).toEqual({ error: expect.stringMatching(/reference/) });
    expect(parseAmount("(1,000.50)")).toBe(-1000.5);
    expect(parseAmount("1.234,56")).toBe(1234.56);
  });
});

describe("reconciliation", () => {
  const ledger: LedgerEntry[] = [
    { id: "p1", kind: "payment_in", references: ["MOMO-SIM-AB12CD34"], amount: 10250, date: "2026-11-20", label: "Milestone 1" },
    { id: "p2", kind: "payment_in", references: ["AWP-7KQ4ZD"], amount: 5000, date: "2026-11-20", label: "Bank transfer" },
    { id: "o1", kind: "payout", references: ["PAYOUT-SIM-99XX"], amount: 9250, date: "2026-11-21", label: "Payout" },
    { id: "o2", kind: "payout", references: ["MG-778899"], amount: 300, date: "2026-11-21", label: "mGurush payout" },
  ];

  it("matches by reference, even inside bank narration text, and flags the rest", () => {
    const lines = [
      { row: 2, date: null, reference: "MOMO-SIM-AB12CD34", amount: 10250, direction: "in" as const, description: "" },
      { row: 3, date: null, reference: "FT2611", amount: 5000, direction: "in" as const, description: "TRF FROM NGO REF AWP 7KQ4ZD" },
      { row: 4, date: null, reference: "PAYOUT-SIM-99XX", amount: 9200, direction: "out" as const, description: "" },
      { row: 5, date: null, reference: "UNKNOWN-1", amount: 42, direction: "in" as const, description: "" },
    ];
    const r = reconcile(lines, ledger);
    expect(r.matched.map((m) => m.entry.id)).toEqual(["p1", "p2"]);
    expect(r.amountMismatches.map((m) => m.entry.id)).toEqual(["o1"]);
    expect(r.unmatchedStatement.map((l) => l.row)).toEqual([5]);
    expect(r.missingFromStatement.map((e) => e.id)).toEqual(["o2"]);
  });
});

describe("wallet name check", () => {
  it("matches names in any order and flags partial or different names", () => {
    expect(compareNames("DENG JOHN MAYEN", "John Mayen Deng")).toBe("match");
    expect(compareNames("John Deng", "John Mayen Deng")).toBe("match");
    expect(compareNames("John Garang", "John Mayen Deng")).toBe("close");
    expect(compareNames("Mary Akol", "John Mayen Deng")).toBe("different");
  });
});
