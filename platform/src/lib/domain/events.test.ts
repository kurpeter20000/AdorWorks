import { describe, expect, it } from "vitest";
import { DOMAIN_EVENTS } from "./events";

describe("domain event contract", () => {
  it("uses unique, namespaced event names", () => {
    const events = Object.values(DOMAIN_EVENTS);
    expect(new Set(events).size).toBe(events.length);
    expect(events.every((event) => /^[a-z]+(?:\.[a-z_]+){1,2}$/.test(event))).toBe(true);
  });
});
