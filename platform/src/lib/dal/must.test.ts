import { describe, it, expect } from "vitest";
import { must } from "./must";

describe("must", () => {
  it("returns the result untouched when there is no error", () => {
    const r = { data: [1, 2], error: null };
    expect(must(r, "things")).toBe(r);
  });
  it("passes through fallback objects that have no error key", () => {
    expect(must({ data: [] }, "things").data).toEqual([]);
  });
  it("throws a descriptive error when the query failed", () => {
    expect(() => must({ data: null, error: { message: "JWT expired" } }, "your offers")).toThrow("Could not load your offers: JWT expired");
  });
});
