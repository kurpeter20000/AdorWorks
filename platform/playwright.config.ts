import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  retries: 1,
  timeout: 60000,
  reporter: "list",
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
    navigationTimeout: 30000,
    actionTimeout: 15000,
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    // S12-14: cross-browser coverage, deliberately scoped rather than
    // tripling the whole suite's runtime against the shared test project.
    // testMatch limits these two to the responsive/priority-journey spec
    // (the one file that's explicitly about "do priority journeys work",
    // not a specific feature's business logic — every feature's own real
    // behavior is already exercised once, on chromium, by the rest of the
    // suite); grep further limits them to a representative subset of that
    // file's own tests (the most universally-used pages) rather than
    // every journey at every viewport, to keep this bounded.
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
      testMatch: /mobile-responsive\.spec\.ts/,
      grep: /login page|signup page|talent dashboard|employer dashboard/,
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
      testMatch: /mobile-responsive\.spec\.ts/,
      grep: /login page|signup page|talent dashboard|employer dashboard/,
    },
  ],
});
