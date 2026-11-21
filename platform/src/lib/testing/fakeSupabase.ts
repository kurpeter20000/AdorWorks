/**
 * A tiny in-memory stand-in for the Supabase query builder, for unit-testing
 * Server Actions without a database. Supports the subset the money actions
 * use: select/insert/update/delete with eq/neq/or/in/gte/limit/order and
 * maybeSingle/single, plus rpc("next_receipt_number").
 *
 * Each query runs as ONE step when awaited (like a single SQL statement),
 * and every await yields to other pending work first — so firing two
 * actions with Promise.all interleaves them the way two real requests
 * would, which is exactly what race-condition tests need.
 */
type Row = Record<string, unknown>;
type Filter = (row: Row) => boolean;
type Result = { data: unknown; error: { message: string } | null; count?: number };

let nextId = 1;

export function createFakeSupabase(tables: Record<string, Row[]>) {
  const db: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(tables)) db[name] = rows.map((r) => ({ ...r }));
  const failures: Record<string, string> = {};

  function from(table: string) {
    db[table] ??= [];
    let op: "select" | "insert" | "update" | "delete" = "select";
    let payload: Row | Row[] | null = null;
    let returning = false;
    let single: "maybe" | "one" | null = null;
    let limit: number | null = null;
    let countOnly = false;
    const filters: Filter[] = [];

    function parseValue(v: string): unknown {
      if (v === "null") return null;
      if (v === "true") return true;
      if (v === "false") return false;
      return v;
    }

    const builder = {
      select(_cols?: string, opts?: { count?: string; head?: boolean }) {
        if (op !== "select") returning = true;
        if (opts?.head) countOnly = true;
        return builder;
      },
      insert(rows: Row | Row[]) {
        op = "insert";
        payload = rows;
        return builder;
      },
      update(values: Row) {
        op = "update";
        payload = values;
        return builder;
      },
      delete() {
        op = "delete";
        return builder;
      },
      eq(col: string, val: unknown) {
        filters.push((r) => r[col] === val);
        return builder;
      },
      neq(col: string, val: unknown) {
        filters.push((r) => r[col] !== val);
        return builder;
      },
      is(col: string, val: unknown) {
        filters.push((r) => (r[col] ?? null) === val);
        return builder;
      },
      gte(col: string, val: unknown) {
        filters.push((r) => String(r[col] ?? "") >= String(val));
        return builder;
      },
      in(col: string, vals: unknown[]) {
        filters.push((r) => vals.includes(r[col]));
        return builder;
      },
      or(expr: string) {
        const parts = expr.split(",").map((p) => {
          const [col, operator, ...rest] = p.split(".");
          const val = parseValue(rest.join("."));
          if (operator === "is" || operator === "eq") return (r: Row) => (r[col] ?? null) === val;
          if (operator === "neq") return (r: Row) => (r[col] ?? null) !== val;
          throw new Error(`fakeSupabase: unsupported or() operator ${operator}`);
        });
        filters.push((r) => parts.some((f) => f(r)));
        return builder;
      },
      order() {
        return builder;
      },
      limit(n: number) {
        limit = n;
        return builder;
      },
      maybeSingle() {
        single = "maybe";
        return builder;
      },
      single() {
        single = "one";
        return builder;
      },
      then<T>(resolve: (r: Result) => T, reject?: (e: unknown) => T) {
        // Yield first so concurrent actions interleave between statements.
        return new Promise<void>((r) => setTimeout(r, 0)).then(() => execute()).then(resolve, reject);
      },
    };

    function execute(): Result {
      const failKey = `${table}.${op}`;
      if (failures[failKey]) return { data: null, error: { message: failures[failKey] } };
      const rows = db[table];
      const match = (r: Row) => filters.every((f) => f(r));
      let out: Row[];
      if (op === "insert") {
        const list = Array.isArray(payload) ? payload : [payload as Row];
        out = list.map((r) => ({ id: `fake-${nextId++}`, ...r }));
        rows.push(...out);
        if (!returning) return { data: null, error: null };
      } else if (op === "update") {
        out = rows.filter(match);
        for (const r of out) Object.assign(r, payload);
        if (!returning) return { data: null, error: null };
      } else if (op === "delete") {
        out = rows.filter(match);
        db[table] = rows.filter((r) => !match(r));
        if (!returning) return { data: null, error: null };
      } else {
        out = rows.filter(match);
        if (countOnly) return { data: null, error: null, count: out.length } as Result;
      }
      if (limit !== null) out = out.slice(0, limit);
      const copies = out.map((r) => ({ ...r }));
      if (single === "one") {
        return copies.length === 1 ? { data: copies[0], error: null } : { data: null, error: { message: "expected one row" } };
      }
      if (single === "maybe") {
        if (copies.length > 1) return { data: null, error: { message: "multiple rows returned" } };
        return { data: copies[0] ?? null, error: null };
      }
      return { data: copies, error: null };
    }

    return builder;
  }

  let receiptSeq = 0;
  async function rpc(name: string): Promise<Result> {
    await new Promise<void>((r) => setTimeout(r, 0));
    if (failures[`rpc.${name}`]) return { data: null, error: { message: failures[`rpc.${name}`] } };
    if (name === "next_receipt_number") return { data: `AW-TEST-${String(++receiptSeq).padStart(6, "0")}`, error: null };
    return { data: null, error: { message: `fakeSupabase: unknown rpc ${name}` } };
  }

  return {
    client: { from, rpc },
    db,
    /** Make every `<table>.<op>` query fail with this message, e.g. failNext("milestones.insert", "boom"). */
    fail(key: string, message: string) {
      failures[key] = message;
    },
  };
}
