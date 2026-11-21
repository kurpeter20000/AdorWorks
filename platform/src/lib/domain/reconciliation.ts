/**
 * Statement reconciliation (0125). Finance uploads a CSV statement from
 * MTN MoMo, mGurush or a bank. Formats differ, so columns are found by
 * their header names. Every line is matched to AdorWorks' records by
 * reference; anything that doesn't match is listed for follow-up.
 * Pure, so it is tested.
 */
export interface StatementLine {
  row: number;
  date: string | null;
  reference: string;
  amount: number;
  /** "in" = money received by AdorWorks, "out" = money sent. */
  direction: "in" | "out";
  description: string;
}

export interface LedgerEntry {
  id: string;
  kind: "payment_in" | "payout";
  /** Any reference that can appear on the statement (e.g. a bank transfer's AWP- reference and the bank's own). */
  references: string[];
  amount: number;
  date: string;
  label: string;
}

export interface ReconcileResult {
  matched: { line: StatementLine; entry: LedgerEntry }[];
  amountMismatches: { line: StatementLine; entry: LedgerEntry }[];
  unmatchedStatement: StatementLine[];
  missingFromStatement: LedgerEntry[];
}

/** Minimal RFC 4180 CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ",") {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(cell);
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim() !== "")) rows.push(row);
  return rows;
}

const HEADERS = {
  reference: ["reference", "ref", "transaction id", "transaction reference", "external id", "txn id", "trans id", "financial transaction id", "narration ref", "id"],
  amount: ["amount", "value", "transaction amount"],
  credit: ["credit", "money in", "deposit", "received", "cr"],
  debit: ["debit", "money out", "withdrawal", "sent", "dr"],
  date: ["date", "transaction date", "value date", "posting date", "time", "datetime"],
  direction: ["type", "direction", "transaction type", "dr/cr"],
  description: ["description", "narration", "details", "remarks", "memo", "note"],
} as const;

function findColumn(header: string[], names: readonly string[]): number {
  const norm = header.map((h) => h.trim().toLowerCase());
  for (const n of names) {
    const i = norm.indexOf(n);
    if (i !== -1) return i;
  }
  for (const n of names) {
    const i = norm.findIndex((h) => h.includes(n));
    if (i !== -1) return i;
  }
  return -1;
}

export function parseAmount(raw: string): number | null {
  if (!raw) return null;
  let s = raw.replace(/[^\d.,()-]/g, "");
  const negative = /^\(.*\)$/.test(s) || s.startsWith("-");
  s = s.replace(/[()-]/g, "");
  // "1.234,56" (comma decimals) vs "1,234.56"
  if (/,\d{2}$/.test(s) && s.includes(".")) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n) || s === "") return null;
  return negative ? -n : n;
}

/** Statement lines from a CSV, or an error saying which column couldn't be found. */
export function readStatement(text: string): { lines: StatementLine[] } | { error: string } {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: "The file has no transactions in it." };
  const header = rows[0];
  const ref = findColumn(header, HEADERS.reference);
  const amount = findColumn(header, HEADERS.amount);
  const credit = findColumn(header, HEADERS.credit);
  const debit = findColumn(header, HEADERS.debit);
  const date = findColumn(header, HEADERS.date);
  const dir = findColumn(header, HEADERS.direction);
  const desc = findColumn(header, HEADERS.description);
  if (ref === -1) return { error: "Couldn't find a reference / transaction ID column. Check the first row has column names." };
  if (amount === -1 && credit === -1 && debit === -1) return { error: "Couldn't find an amount, credit or debit column." };

  const lines: StatementLine[] = [];
  rows.slice(1).forEach((r, i) => {
    const reference = (r[ref] ?? "").trim();
    if (!reference) return;
    let value: number | null = null;
    let direction: "in" | "out" = "in";
    const c = credit !== -1 ? parseAmount(r[credit] ?? "") : null;
    const d = debit !== -1 ? parseAmount(r[debit] ?? "") : null;
    if (c) {
      value = Math.abs(c);
      direction = "in";
    } else if (d) {
      value = Math.abs(d);
      direction = "out";
    } else if (amount !== -1) {
      const a = parseAmount(r[amount] ?? "");
      if (a === null) return;
      value = Math.abs(a);
      const kind = dir !== -1 ? (r[dir] ?? "").toLowerCase() : "";
      direction = a < 0 || /debit|out|dr|withdraw|transfer to|payout|disburse/.test(kind) ? "out" : "in";
    }
    if (value === null) return;
    lines.push({ row: i + 2, date: date !== -1 ? (r[date] ?? "").trim() || null : null, reference, amount: value, direction, description: desc !== -1 ? (r[desc] ?? "").trim() : "" });
  });
  if (lines.length === 0) return { error: "No transactions with a reference and an amount were found." };
  return { lines };
}

const normRef = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

/**
 * Matches by reference (ignoring case, spaces and dashes; a statement
 * reference that contains ours also counts, as banks often wrap it in
 * narration text). Same reference but a different amount is flagged, not
 * matched.
 */
export function reconcile(lines: StatementLine[], ledger: LedgerEntry[]): ReconcileResult {
  const result: ReconcileResult = { matched: [], amountMismatches: [], unmatchedStatement: [], missingFromStatement: [] };
  const used = new Set<string>();
  for (const line of lines) {
    const ref = normRef(line.reference + " " + line.description);
    const want = line.direction === "in" ? "payment_in" : "payout";
    const entry = ledger.find(
      (e) => !used.has(e.id) && e.kind === want && e.references.some((r) => normRef(r).length >= 4 && ref.includes(normRef(r)))
    );
    if (!entry) {
      result.unmatchedStatement.push(line);
      continue;
    }
    used.add(entry.id);
    if (Math.abs(entry.amount - line.amount) > 0.01) result.amountMismatches.push({ line, entry });
    else result.matched.push({ line, entry });
  }
  result.missingFromStatement = ledger.filter((e) => !used.has(e.id));
  return result;
}
