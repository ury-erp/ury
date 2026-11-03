// Settings for the headless e2e runner (e2e/run.mjs). Plain constants: the
// runner uses the `playwright` library directly (no @playwright/test).
export default {
  baseURL: process.env.BRIEF_BASE_URL || "http://localhost:8002",
  viewport: { width: 390, height: 844 },
  proofDir: process.env.BRIEF_PROOF_DIR || "/Users/safwan/Code/URY/ury_workspaces/tracks/frappe-insights-skill/proof/pwa",
  // Credentials live outside the repo: JSON {chair:{usr,pwd}, norole:{usr,pwd}}
  envFile: process.env.BRIEF_E2E_ENV || "/private/tmp/brief-e2e/env.json",
  chromiumArgs: ["--use-fake-ui-for-media-stream", "--use-fake-device-for-media-stream"],
};
