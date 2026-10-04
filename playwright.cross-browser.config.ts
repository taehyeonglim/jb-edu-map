import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

// Optional deterministic browser matrix; the default CI stays Chromium-only.
const external = ["**/deployed-*.spec.ts", "**/city-buildings-live.spec.ts"];
export default defineConfig(base, {
  workers: 1,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 15000 },
  use: { ...base.use, reducedMotion: "reduce" },
  projects: [
    { ...base.projects![0], testIgnore: external },
    ...(["firefox", "webkit"] as const).map(browserName => ({
      name: browserName,
      // This one spec uses Chromium-specific flags to disable WebGL.
      testIgnore: [...external, "**/fallback-webgl.spec.ts"],
      use: {
        ...devices[browserName === "firefox" ? "Desktop Firefox" : "Desktop Safari"],
        viewport: { width: 1600, height: 900 },
      },
    })),
  ],
});
