import { describe, expect, it } from "vitest";
import {
  CATEGORY_LABEL,
  ENGAGEMENT_TYPE_LABEL,
  PAYMENT_BASIS_LABEL,
  WORK_MODE_LABEL,
  categoryOptions,
  engagementTypeOptions,
} from "./taxonomy";

describe("taxonomy contracts", () => {
  it("covers every current database enum value exactly once", () => {
    expect(Object.keys(CATEGORY_LABEL)).toEqual([
      "creative_media",
      "digital_technology",
      "business_project_support",
    ]);
    expect(Object.keys(ENGAGEMENT_TYPE_LABEL)).toEqual([
      "freelance",
      "fixed_term_contract",
      "full_time",
      "internship",
      "apprenticeship",
      "managed_service",
    ]);
    expect(Object.keys(WORK_MODE_LABEL)).toEqual(["remote", "on_site", "hybrid", "any"]);
    expect(Object.keys(PAYMENT_BASIS_LABEL)).toEqual([
      "fixed",
      "milestone",
      "hourly",
      "daily",
      "monthly",
      "negotiable",
    ]);
  });

  it("option helpers return [value, label] pairs in the same order as the map", () => {
    expect(categoryOptions()).toEqual(Object.entries(CATEGORY_LABEL));
    expect(engagementTypeOptions()).toEqual(Object.entries(ENGAGEMENT_TYPE_LABEL));
  });
});
