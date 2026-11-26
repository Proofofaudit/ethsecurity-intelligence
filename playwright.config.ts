import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3100);

/**
 * End-to-end tests run against a production build (`npm run build` first) served by `next start`.
 * MONGODB_URI is forced empty so the server uses the file store (data/published), whatever is in
 * .env.local; corrections submitted by the tests go to a throwaway directory under test-results/.
 */
export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "off" },
  webServer: {
    command: `npx next start -p ${port}`,
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      MONGODB_URI: "",
      ESI_LOCAL_STATE_DIR: path.join(process.cwd(), "test-results", "e2e-state"),
      RATE_LIMIT_SALT: "e2e-only-salt",
      // Render from the committed snapshot only, so results do not depend on TheDAO's live API.
      ESI_LIVE_MANIFEST: "off",
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
