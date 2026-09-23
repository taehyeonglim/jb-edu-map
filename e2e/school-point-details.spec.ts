import { openPanel, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function clickOnlySchoolPoint(page: Page, offsetX = 0) {
  await page.waitForFunction(async () => {
    const deck = window.__jbmap?.deck;
    if (!deck) return false;
    const position = () => {
      const view = deck.getViewports()[0] as unknown as { longitude: number; latitude: number; zoom: number };
      return [view.longitude, view.latitude, view.zoom];
    };
    const before = position();
    await new Promise((resolve) => setTimeout(resolve, 150));
    const after = position();
    return before.every((value, index) => Math.abs(value - after[index]) < 0.00001);
  }, null, { timeout: 10000 });
  const point = await page.evaluate(() => {
    const deck = window.__jbmap!.deck;
    const layer = (deck.props.layers as unknown as { id: string; props: { data: { id: string; lng: number; lat: number }[] } }[])
      .find((candidate) => candidate?.id === "schools")!;
    const school = layer.props.data[0];
    const [x, y] = deck.getViewports()[0].project([school.lng, school.lat, 1]);
    return { x, y, id: school.id };
  });
  const bounds = (await page.locator("#school-map").boundingBox())!;
  await expect.poll(() => page.evaluate(({ x, y }) => {
    const hit = window.__jbmap!.deck.pickObject({ x, y, radius: 14, layerIds: ["schools"] });
    return (hit?.object as { id?: string } | undefined)?.id ?? null;
  }, { x: point.x + offsetX, y: point.y })).toBe(point.id);
  await page.mouse.click(bounds.x + point.x + offsetX, bounds.y + point.y);
  await expect(page).toHaveURL(new RegExp(`school=${point.id}`));
  await expect(page).toHaveURL(/region=52110/);
}

test("통계 화면에서 학교 점을 누르면 해당 위치에 HUD가 열린다", async ({ page }) => {
  await page.goto("/?scene=flat&schoolChart=dots&view=schools&region=52110");
  await openPanel(page);
  await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
  await page.getByRole("tab", { name: "시군 통계" }).click();
  await clickOnlySchoolPoint(page, 10);
  await expect(page).toHaveURL(/view=statistics/);
  await expect(page.getByRole("complementary")).toHaveCount(0);
  await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
  await expect(page.getByRole("complementary").getByRole("region", { name: "선택한 학교" })).toHaveCount(0);
  await expect(page.getByTestId("school-hud")).toContainText("학생");
  const placement = await page.evaluate(() => {
    const map = document.getElementById("school-map")!.getBoundingClientRect();
    const card = document.querySelector('[data-testid="school-hud"]')!.getBoundingClientRect();
    const anchor = document.querySelector('[data-testid="school-hud-anchor"] circle')!;
    const x = Number(anchor.getAttribute("cx"));
    const y = Number(anchor.getAttribute("cy"));
    return { inside: card.left >= map.left && card.right <= map.right && card.top >= map.top && card.bottom <= map.bottom, anchorInside: x >= 0 && x <= map.width && y >= 0 && y <= map.height };
  });
  expect(placement).toEqual({ inside: true, anchorInside: true });
  await page.getByRole("button", { name: "학교 HUD 닫기" }).click();
  await expect(page.getByTestId("school-hud")).toHaveCount(0);
});

test("기본 지도 설정에서도 학교 점 주변을 누르면 상세가 열린다", async ({ page }) => {
  await page.goto("/?scene=flat&view=schools&region=52110");
  await openPanel(page);
  await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
  await clickOnlySchoolPoint(page, 10);
  await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
});

test("모바일에서 학교 점을 누르면 정보를 바로 볼 수 있다", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?scene=flat&schoolChart=dots&view=schools&region=52110");
  await openPanel(page);
  await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
  await page.getByRole("button", { name: "패널 닫기" }).click();
  await clickOnlySchoolPoint(page, 10);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
});
