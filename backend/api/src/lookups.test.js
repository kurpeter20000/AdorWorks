import { describe, it, expect } from "vitest";
import { lookupKind } from "./lookups.js";

describe("staff person lookup", () => {
  it("recognises an email", () => expect(lookupKind(" Grace@Example.org ")).toEqual({ kind: "email", value: "grace@example.org" }));
  it("recognises an account id", () =>
    expect(lookupKind("0F8FAD5B-D9CB-469F-A165-70867728950E")).toEqual({ kind: "id", value: "0f8fad5b-d9cb-469f-a165-70867728950e" }));
  it("matches a phone number however it's written", () => {
    expect(lookupKind("+211 912 345 678")).toEqual({ kind: "phone", value: "912345678" });
    expect(lookupKind("0912-345-678")).toEqual({ kind: "phone", value: "912345678" });
  });
  it("falls back to part of a name, without filter syntax", () => expect(lookupKind("Amani (Juba)")).toEqual({ kind: "name", value: "Amani  Juba" }));
});
