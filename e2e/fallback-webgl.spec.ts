import { expect, test } from "./fixtures";

// Task 6, Section A.1 — MapShell shows MapFallback's table instead of the 3D
// map when `document.createElement('canvas').getContext('webgl2')` fails.
//
// `--disable-webgl`/`--disable-webgl2` are real Chromium launch flags that
// make every `getContext('webgl'|'webgl2')` call return null. `launchOptions`
// can only be set via `test.use()` at a spec FILE's top level (Playwright:
// "Cannot use({ launchOptions }) in a describe group, because it forces a
// new worker. Make it top-level in the test file or put in the configuration
// file.") — confirmed empirically while writing this spec — hence this is
// its own file rather than a `describe` block inside e2e/fallback-viewport.spec.ts.
// This REPLACES (not merges with) the CI-only swiftshader args
// playwright.config.ts's `chromium` project otherwise sets, which is exactly
// what's wanted here: WebGL genuinely unavailable, not software-rendered.
test.use({ launchOptions: { args: ["--disable-webgl", "--disable-webgl2"] } });

test("WebGL2 컨텍스트를 생성할 수 없으면 지도 대신 표를 보여준다", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  await page.goto("/");

  // Confirms the launch flag actually took effect, independent of this
  // app's own MapShell logic — if this assertion ever fails, the flag
  // stopped working in a newer Chromium and the test below would otherwise
  // fail for a confusing, unrelated reason.
  const webgl2Available = await page.evaluate(() => !!document.createElement("canvas").getContext("webgl2"));
  expect(webgl2Available).toBe(false);

  await expect(page.getByTestId("map-fallback-reason")).toHaveText(
    "이 환경에서는 지도를 표시할 수 없어 표로 보여드립니다",
  );
  await expect(page.getByRole("table")).toBeVisible();
  // The deck.gl canvas is never even attempted.
  await expect(page.locator("canvas")).toHaveCount(0);

  expect(consoleErrors).toEqual([]);
});

for (const width of [1440, 390]) {
  test(`WebGL 대체 화면 ${width}px: 학교 선택·공유 링크·통계·선택 해제`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.getByTestId("map-fallback-reason")).toBeVisible();
    await page.getByRole("button", { name: "학교·통계", exact: true }).click();
    await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
    await page.getByTestId("school-row-B000005959").click();
    const detail = page.getByTestId("fallback-school-detail");
    await expect(detail).toContainText("전주초등학교");
    await expect(detail).toContainText("228명");
    await expect(detail).toBeFocused();
    await expect(detail.getByRole("heading")).toBeInViewport();
    const heading = (await detail.getByRole("heading").boundingBox())!;
    const header = (await page.locator(".cyber-command").boundingBox())!;
    expect(heading.y).toBeGreaterThanOrEqual(header.y + header.height);
    await expect(page).toHaveURL(/school=B000005959/);
    await page.reload();
    await expect(detail).toBeVisible();
    await detail.getByRole("button", { name: "해당 시군 통계 보기" }).click();
    await expect(page.getByRole("tab", { name: "시군 통계" })).toHaveAttribute("aria-selected", "true");
    await expect(page).toHaveURL(/region=52110/);
    await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
    await detail.getByRole("button", { name: "학교 선택 해제" }).click();
    await expect(detail).toHaveCount(0);
    await expect(page).not.toHaveURL(/school=/);
  });
}
