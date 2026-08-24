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
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
