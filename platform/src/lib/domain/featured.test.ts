import { describe, expect, it } from "vitest";
import { featuredFirst, isFeatured } from "./featured";

const now = new Date("2026-11-22T12:00:00Z");
const row = (id: string, created: string, featured: string | null = null) => ({ id, created_at: created, approved_at: null, featured_until: featured });

describe("featured jobs", () => {
  it("is featured only until featured_until", () => {
    expect(isFeatured({ featured_until: "2026-11-30T00:00:00Z" }, now)).toBe(true);
    expect(isFeatured({ featured_until: "2026-11-01T00:00:00Z" }, now)).toBe(false);
    expect(isFeatured({ featured_until: null }, now)).toBe(false);
  });

  it("lists featured jobs first, then the newest; expired featuring counts as normal", () => {
    const rows = [
      row("old", "2026-11-01T00:00:00Z"),
      row("new", "2026-11-20T00:00:00Z"),
      row("paid", "2026-10-01T00:00:00Z", "2026-12-01T00:00:00Z"),
      row("expired", "2026-11-21T00:00:00Z", "2026-11-10T00:00:00Z"),
    ];
    expect(featuredFirst(rows, now).map((r) => r.id)).toEqual(["paid", "expired", "new", "old"]);
  });
});
