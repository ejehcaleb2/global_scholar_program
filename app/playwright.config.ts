import { defineConfig, devices } from "@playwright/test";
import environmentHelper from "./scripts/e2e-environment.mjs";
const { appRoot, backendRoot, python, e2eEnvironment } = environmentHelper;

const environment = e2eEnvironment();
Object.assign(process.env, environment);
const frontendUrl = environment.GSP_E2E_BASE_URL;
const apiUrl = environment.GSP_E2E_API_URL;

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-artifacts/results",
  globalSetup: "./scripts/e2e-setup.ts",
  globalTeardown: "./scripts/e2e-teardown.ts",
  fullyParallel: false,
  workers: 1,
  expect: { timeout: 10_000 },
  retries: 0,
  reporter: "list",
  use: { baseURL: frontendUrl, trace: "retain-on-failure", ...devices["Desktop Chrome"] },
  webServer: [
    {
      command: `"${python}" -m uvicorn app.main:app --host 127.0.0.1 --port 8101`,
      cwd: backendRoot,
      url: `${apiUrl}/health`,
      env: { APP_ENV: environment.APP_ENV, DATABASE_URL: environment.DATABASE_URL, JWT_SECRET: environment.JWT_SECRET,
        GSP_UPLOAD_DIR: environment.GSP_E2E_UPLOAD_DIR, API_BASE_URL: apiUrl,
        RATE_AVATAR_UPLOAD: "2", RATE_LOGIN_IP: "10000", RATE_SIGNUP_IP: "10000", RATE_REFRESH_IP: "10000",
        CORS_ORIGINS: frontendUrl },
      stdout: "pipe",
      stderr: "pipe",
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: "npm run build && npm run start -- --hostname 127.0.0.1 --port 3101",
      cwd: appRoot,
      url: `${frontendUrl}/login`,
      env: { NEXT_PUBLIC_API_URL: apiUrl, NEXT_DIST_DIR: ".next-e2e", NEXT_TELEMETRY_DISABLED: "1" },
      stdout: "pipe",
      stderr: "pipe",
      reuseExistingServer: false,
      timeout: 900_000,
    },
  ],
});
