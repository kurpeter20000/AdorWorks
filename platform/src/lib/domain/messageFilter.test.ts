import { describe, expect, it } from "vitest";
import { containsContactDetails, findContactDetails } from "./messageFilter";

describe("containsContactDetails", () => {
  it("blocks an email address", () => {
    expect(containsContactDetails("reach me at peter@gmail.com please")).toBe(true);
  });

  it("blocks a formatted phone number", () => {
    expect(containsContactDetails("call me on +211 912 345 678")).toBe(true);
    expect(containsContactDetails("my number is 0912-345-678")).toBe(true);
  });

  it("blocks a WhatsApp/Telegram mention or handle", () => {
    expect(containsContactDetails("message me on WhatsApp instead")).toBe(true);
    expect(containsContactDetails("find me on telegram")).toBe(true);
    expect(containsContactDetails("my handle is @peterlual")).toBe(true);
  });

  it("lets ordinary scope-and-budget conversation through", () => {
    expect(containsContactDetails("I can do this for 2500000 SSP by Friday.")).toBe(false);
    expect(containsContactDetails("Let's aim for 3 revisions max, budget is 500000.")).toBe(false);
    expect(containsContactDetails("Thanks, that works for me!")).toBe(false);
    expect(containsContactDetails("Can you deliver 1000 units by next week?")).toBe(false);
  });

  it("does not flag a bare unbroken digit run (documented limitation)", () => {
    expect(containsContactDetails("211912345678")).toBe(false);
  });

  it("findContactDetails reports which kinds matched", () => {
    expect(findContactDetails("email me at a@b.com or call +211912345678")).toEqual(
      expect.arrayContaining(["email", "phone"])
    );
  });
});
