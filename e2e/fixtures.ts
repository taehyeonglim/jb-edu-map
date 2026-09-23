import { test as base, expect, type Page } from "@playwright/test";

// A minimal valid 1x1 PNG (68 bytes, signature-verified) — stands in for
// every real VWorld WMTS tile response below. Real VWorld tiles are
// publicly reachable with no key validation at the CORS layer (bad keys
// return 200 + an XML ExceptionReport, not a 4xx — see task-C-brief.md's
// "검증된 사실"), but e2e should never depend on the network OR on
// `.env.local`'s real key existing in whatever environment runs this suite.
const PNG_1X1_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
const PNG_1X1 = Buffer.from(PNG_1X1_BASE64, "base64");

/** Stub road tiles so browser tests do not depend on VWorld availability or keys. */
export const test = base.extend<object>({
  page: async ({ page }, use) => {
    await page.route("**/api.vworld.kr/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "image/png",
        headers: { "access-control-allow-origin": "*" },
        body: PNG_1X1,
      }),
    );
    await page.route("**/api/buildings/**", route => route.fulfill({ json: {
      type: "FeatureCollection", features: [], metadata: { complete: true, fetchedAt: "2026-09-22T00:00:00Z", source: "test" },
    } }));
    // Playwright's own fixture-callback convention — this `use` is the
    // fixture-teardown callback (Playwright's `TestFixture` param), not a
    // React hook; eslint-plugin-react-hooks flags it purely because of the
    // name.
    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page);
  },
});

export { expect };

/**
 * Diagnostic screenshot for local runs only. On CI (headless Chromium on
 * swiftshader software GL) a full-page WebGL capture costs ~10 s each —
 * trace analysis of run 35578948946 showed two of them consuming 20–22 s of
 * a test's 30 s budget, which is what actually made select-region flake
 * (not the Escape assertion). CI already keeps `screenshot: "only-on-failure"`
 * and records a trace from the first retry onward (playwright.config.ts
 * `trace: "on-first-retry"`), so nothing is lost there.
 */
export async function docShot(page: Page, name: string): Promise<void> {
  if (process.env.CI) return;
  await page.screenshot({ path: `test-results/${name}.png` });
}

/** Panels/settings now start collapsed to give the thematic map room. */
export async function openPanel(page: Page) {
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  if (await page.locator('aside[aria-label="학교 탐색 및 시군 통계"]').isVisible()) return;
  const opener = page.getByRole("button", { name: "학교·통계", exact: true });
  if (await opener.isVisible()) await opener.click();
}
export async function openMapSettings(page: Page) {
  const summary = page.locator("summary").filter({ hasText: "지도 설정" });
  await expect(summary).toBeVisible();
  if (!(await summary.locator("..").getAttribute("open"))) {
    // Boolean open attributes serialize as an empty string; use DOM presence.
    if (!(await summary.locator("..").evaluate(el => el.hasAttribute("open")))) await summary.click();
  }
}
