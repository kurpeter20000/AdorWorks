import { describe, it, expect } from "vitest";
import { collectionAccountsToJson, describeCollectionAccount, parseCollectionAccounts } from "./collectionAccounts";

describe("AdorWorks collection accounts", () => {
  it("reads each account only when it has a valid number and a name", () => {
    expect(parseCollectionAccounts(null)).toEqual({ mtn_momo: null, mgurush: null });
    const a = parseCollectionAccounts({
      mtn_momo: { number: "0912 345 678", account_name: "AdorWorks Ltd" },
      mgurush: { number: "12", account_name: "AdorWorks Ltd" },
    });
    expect(a.mtn_momo).toEqual({ number: "+211912345678", accountName: "AdorWorks Ltd" });
    expect(a.mgurush).toBeNull();
  });

  it("round-trips and describes", () => {
    const a = { mtn_momo: { number: "+211912345678", accountName: "AdorWorks Ltd" }, mgurush: null };
    expect(parseCollectionAccounts(collectionAccountsToJson(a))).toEqual(a);
    expect(describeCollectionAccount("mtn_momo", a.mtn_momo)).toBe("MTN MoMo · AdorWorks Ltd · +211912345678");
    expect(describeCollectionAccount("mgurush", null)).toBeNull();
  });
});
