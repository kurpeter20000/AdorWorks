import { describe, expect, it } from "vitest";
import { jobMatchesAlert, splitList, type AlertJob, type JobAlertPrefs } from "./jobAlerts";

const none: JobAlertPrefs = {
  job_alert_categories: [],
  job_alert_keywords: [],
  job_alert_engagement_types: [],
  job_alert_work_modes: [],
  job_alert_locations: [],
};
const job: AlertJob = {
  title: "Brand designer for a youth campaign",
  brief: "Logo and print materials.",
  category: "creative_media",
  skills: ["Graphic design", "Figma"],
  engagement_type: "freelance",
  work_mode: "on_site",
  location: "Juba, Central Equatoria",
};
const designer = { category: "creative_media", skills: ["Illustration"] };
const coder = { category: "digital_technology", skills: ["React"] };

describe("jobMatchesAlert", () => {
  it("with nothing chosen, uses the talent's own field", () => {
    expect(jobMatchesAlert(none, job, designer)).toBe(true);
    expect(jobMatchesAlert(none, job, coder)).toBe(false);
  });

  it("with nothing chosen, a profile skill named in the job is enough", () => {
    expect(jobMatchesAlert(none, job, { category: "digital_technology", skills: ["figma"] })).toBe(true);
  });

  it("with an empty profile and no choices, sends nothing", () => {
    expect(jobMatchesAlert(none, job, { category: null, skills: [] })).toBe(false);
  });

  it("chosen fields replace the profile", () => {
    expect(jobMatchesAlert({ ...none, job_alert_categories: ["creative_media"] }, job, coder)).toBe(true);
    expect(jobMatchesAlert({ ...none, job_alert_categories: ["digital_technology"] }, job, designer)).toBe(false);
  });

  it("keywords match the title, brief or skills, ignoring case", () => {
    expect(jobMatchesAlert({ ...none, job_alert_keywords: ["LOGO"] }, job, coder)).toBe(true);
    expect(jobMatchesAlert({ ...none, job_alert_keywords: ["translation"] }, job, designer)).toBe(false);
  });

  it("filters by kind of work and work mode", () => {
    expect(jobMatchesAlert({ ...none, job_alert_engagement_types: ["full_time"] }, job, designer)).toBe(false);
    expect(jobMatchesAlert({ ...none, job_alert_work_modes: ["remote"] }, job, designer)).toBe(false);
    expect(jobMatchesAlert({ ...none, job_alert_work_modes: ["remote"] }, { ...job, work_mode: "any" }, designer)).toBe(true);
  });

  it("places apply to in-person work only", () => {
    expect(jobMatchesAlert({ ...none, job_alert_locations: ["juba"] }, job, designer)).toBe(true);
    expect(jobMatchesAlert({ ...none, job_alert_locations: ["Wau"] }, job, designer)).toBe(false);
    expect(jobMatchesAlert({ ...none, job_alert_locations: ["Wau"] }, { ...job, work_mode: "remote" }, designer)).toBe(true);
  });
});

describe("splitList", () => {
  it("splits, trims, de-duplicates and caps", () => {
    expect(splitList(" design, Figma;design \n logo ", 3)).toEqual(["design", "Figma", "logo"]);
    expect(splitList("a,b,c,d", 2)).toEqual(["a", "b"]);
  });
});
