import { openPanel, openMapSettings, expect, test, tabKey } from "./fixtures";
import type { Locator, Page } from "@playwright/test";

// Task 6, Section B. `npx @axe-core/cli` can't be installed (no new
// dependencies — task brief), so this spec exercises the two checks it asks
// for directly via Playwright: keyboard focus order across the 지표 메뉴 →
// 라디오 → 시군 목록 → 패널 chain, and landmark presence.

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

/** Presses Tab up to `maxTabs` times, stopping as soon as `locator` is the focused element. Bounded (not an exact Tab-count assertion) so this doesn't hard-code how many OTHER focusable siblings (KPI tiles, indicator radios, …) happen to sit in between — only that `locator` is reachable via Tab at all, in order. */
async function tabUntilFocused(page: Page, locator: Locator, maxTabs: number): Promise<boolean> {
  const isFocused = () => locator.evaluate((el) => el === document.activeElement).catch(() => false);
  if (await isFocused()) return true;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press(tabKey(page));
    if (await isFocused()) return true;
  }
  return false;
}

test.describe("접근성", () => {
  test("랜드마크: banner/main/complementary/contentinfo 가 모두 존재한다", async ({ page }) => {
    await page.goto("/");
  await openPanel(page);
  await openMapSettings(page);
    await waitForMapReady(page);

    await expect(page.getByRole("banner")).toBeVisible();
    await expect(page.getByRole("main")).toBeVisible();
    await expect(page.getByRole("complementary")).toBeVisible();
    await page.getByRole("tab", { name: "시군 통계" }).click();
    await expect(page.getByRole("contentinfo")).toBeVisible();
  });

  test("포커스 순서: 지표 메뉴 → 라디오 → 시군 목록 → 패널까지 Tab 으로 도달 가능하다", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
    await waitForMapReady(page);

    // 1) 지표 메뉴 ("전체 지표") 버튼 — a fresh page load starts with nothing
    // focused (document.activeElement === body), so tabbing from here
    // exercises the REAL top-of-page order, not a shortcut.
    const menuButton = page.getByRole("button", { name: /^전체 지표/ });
    expect(await tabUntilFocused(page, menuButton, 10)).toBe(true);

    // 2) 라디오: opening the popover (Enter activates the focused native
    // <button>) auto-focuses its first radio (IndicatorMenu.tsx's own open
    // effect) — reachable with zero further Tabs.
    await page.keyboard.press("Enter");
    await expect(page.getByRole("dialog", { name: "전체 지표 선택" })).toBeVisible();
    const firstRadio = page.locator('#indicator-menu-popover input[type="radio"]').first();
    await expect(firstRadio).toBeFocused();

    // Close the popover (Escape — doesn't deselect the map, since nothing is
    // selected yet) so it doesn't obscure/duplicate-focus-trap what follows.
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "전체 지표 선택" })).not.toBeVisible();

    await openPanel(page);
    await page.getByRole("tab", { name: "학교 탐색" }).focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "교육문제" })).toHaveAttribute("aria-selected", "true");
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "시군 통계" })).toHaveAttribute("aria-selected", "true");
    const firstRegionButton = page.getByRole("complementary").getByRole("button", { name: /전주시/ });
    expect(await tabUntilFocused(page, firstRegionButton, 20)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(page.getByRole("heading", { name: "전주시", exact: true })).toBeVisible();
    await openMapSettings(page);
    await page.getByLabel("전북 학교 위치 지도").focus();
    const schoolNames = page.getByRole("button", { name: "학교명", exact: true });
    expect(await tabUntilFocused(page, schoolNames, 10)).toBe(true);
    await page.keyboard.press("Enter");
    await expect(schoolNames).toHaveAttribute("aria-pressed", "false");
    expect(consoleErrors).toEqual([]);
  });

  test("전체보기/확대/축소 위젯 버튼이 Tab 으로 도달 가능하다 (대체 버튼 불필요 확인)", async ({ page }) => {
    // deck.gl's ResetViewWidget/ZoomWidget render real DOM <button
    // aria-label> elements as siblings of the canvas inside the map
    // wrapper — confirmed here they're genuinely Tab-reachable, so the task
    // brief's fallback clause ("대체 버튼... 위젯은 제거") doesn't apply; no
    // custom buttons were added.
    await page.goto("/");
  await openPanel(page);
  await openMapSettings(page);
    await waitForMapReady(page);

    await page.getByLabel("전북 학교 위치 지도").focus();
    const resetView = page.getByRole("button", { name: "전체보기" });
    expect(await tabUntilFocused(page, resetView, 3)).toBe(true);
  });

  test("지표 전환 시 aria-live 낭독 텍스트가 갱신된다", async ({ page }) => {
    await page.goto("/");
  await openPanel(page);
  await openMapSettings(page);
    await waitForMapReady(page);

    const announcement = page.getByTestId("indicator-announcement");
    await expect(announcement).toHaveText("지표 변경: 학생수"); // DEFAULT_INDICATOR_ID

    await page.getByRole("button", { name: /^전체 지표/ }).click();
    await page.getByRole("radio", { name: "학급당 학생수" }).click();

    await expect(announcement).toHaveText("지표 변경: 학급당 학생수");
  });
});
