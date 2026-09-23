import { expect, test, docShot } from "./fixtures";
test.use({
  viewport: { width: 390, height: 844 },
  hasTouch: true,
  isMobile: true,
});

test("모바일에서도 지도와 학교 검색을 사용하고 선택 후 패널이 접힌다", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
  await expect(page.locator("canvas")).toBeVisible();
  await expect(page.getByTestId("map-fallback-reason")).toHaveCount(0);
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "학교 탐색 및 시군 통계" });
  await expect(dialog).toBeVisible();
  await expect(
    page.getByRole("button", { name: "패널 닫기", exact: true }),
  ).toBeFocused();
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  await page.locator('[data-testid^="school-row-"]').first().click();
  await expect(dialog).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(16, 2);
  await expect(page.getByTestId("school-hud")).toBeVisible();
  await docShot(page, "mobile-school-map");
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  await expect(dialog).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(
    page.getByRole("heading", { name: "전주초등학교" }),
  ).toBeVisible();
  await expect(dialog).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "학교·통계", exact: true }),
  ).toBeFocused();
});

test("모바일과 PC 사이 크기 변경 후에도 선택과 배율이 유지된다", async ({
  page,
}) => {
  await page.goto("/?region=52110");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
  await page.getByRole("button", { name: "확대", exact: true }).click();
  await page.waitForTimeout(700);
  const zoom = await page.evaluate(
    () => window.__jbmap!.deck.getViewports()[0].zoom,
  );
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  await expect(page.getByRole("complementary")).toBeVisible();
  await expect(
    page.getByRole("combobox", { name: "시군", exact: true }),
  ).toHaveValue("52110");
  expect(
    await page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom),
  ).toBeCloseTo(zoom, 2);
});
