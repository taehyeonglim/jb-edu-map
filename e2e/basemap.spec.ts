import { openPanel, openMapSettings, expect, test } from "./fixtures";

test("야간 배경을 기본으로 표시하고 사용자가 고른 배경을 복원한다", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await openMapSettings(page);
  await expect(page.getByRole("radio", { name: "야간" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "위성" }).click();
  expect(await page.evaluate(() => localStorage.getItem("jbmap.basemap"))).toBe("satellite");
  await page.reload();
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await openMapSettings(page);
  await expect(page.getByRole("radio", { name: "위성" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "끄기" }).click();
  await expect.poll(() => page.evaluate(() =>
    window.__jbmap!.deck.props.layers?.flat().some((layer) => layer && "id" in layer && layer.id === "basemap"),
  )).toBe(false);
});

test("과거 지도 설정을 무시하고 입체 현황판을 표시하며 지형을 요청하지 않는다", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("jbmap.mapMode.v1", "terrain");
    localStorage.setItem("jbmap.basemap", "satellite");
  });
  let terrainRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("/api/terrain/")) terrainRequests++;
  });
  await page.goto("/");
  await openPanel(page);
  await openMapSettings(page);
  for (let visit = 0; visit < 2; visit++) {
    await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
    await expect(page.getByRole("radiogroup", { name: "지도 모드" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "발표 모드" })).toHaveCount(0);
    if (visit === 0) expect(await page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as import("@deck.gl/core").WebMercatorViewport).pitch)).toBe(20);
    await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
    await page.locator('[data-testid^="school-row-"]').first().click();
    await expect(page.getByRole("heading", { name: "전주초등학교" })).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16, 2);
    expect(terrainRequests).toBe(0);
    await expect(page).toHaveURL(/school=B000005959/);
    await page.getByRole("radio", { name: "평면", exact: true }).click();
    await expect(page).toHaveURL(/scene=flat/);
    await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16, 2);
    await expect(page.getByRole("heading", { name: "전주초등학교" })).toBeVisible();
    await page.goBack();
    await expect(page.getByRole("radio", { name: "입체 현황판" })).toHaveAttribute("aria-checked", "true");
    if (visit === 0) await page.reload();
  await openPanel(page);
  await openMapSettings(page);
  }
});
