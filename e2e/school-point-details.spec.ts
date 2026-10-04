import { openPanel, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

async function clickOnlySchoolPoint(page: Page, offsetX = 0, input: "mouse" | "touch" = "mouse", delay = 0) {
  await expect(page.locator('[data-labels-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect.poll(() => page.evaluate(async () => {
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
  }), { timeout: 20000 }).toBe(true);
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
  if (input === "touch") await page.touchscreen.tap(bounds.x + point.x + offsetX, bounds.y + point.y);
  else await page.mouse.click(bounds.x + point.x + offsetX, bounds.y + point.y, { delay });
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

async function settledCamera(page: Page) {
  await expect.poll(() => page.evaluate(async () => {
    const position = () => {
      const view = window.__jbmap?.deck.getViewports()[0] as unknown as { longitude: number; latitude: number; zoom: number } | undefined;
      return view ? [view.longitude, view.latitude, view.zoom] : null;
    };
    const before = position();
    if (!before || before[2] < 15.99999) return false;
    await new Promise((resolve) => setTimeout(resolve, 200));
    const after = position();
    return after && before.every((value, index) => Math.abs(value - after[index]) < 1e-8);
  }), { timeout: 20000 }).toBe(true);
  return page.evaluate(() => {
    const view = window.__jbmap!.deck.getViewports()[0] as unknown as { longitude: number; latitude: number; zoom: number };
    return [view.longitude, view.latitude, view.zoom];
  });
}

test.describe("학교 클릭 후 드래그 종료", () => {
  // Let the selection fly-to finish before distinguishing it from an unwanted pan.
  test.use({ reducedMotion: "no-preference" });

  for (const scene of ["flat", "city"]) {
    for (const { offset, delay, label } of [
      { offset: 0, delay: 0, label: "점 클릭" },
      { offset: 10, delay: 0, label: "점 주변 클릭" },
      { offset: 0, delay: 400, label: "점을 400ms 누른 뒤 놓기" },
    ]) {
      test(`${scene}: 학교 ${label} 후 버튼 없이 움직여도 지도가 고정된다`, async ({ page }) => {
        await page.goto(`/?scene=${scene}&schoolChart=dots&region=52110&q=${encodeURIComponent("전주초등학교")}`);
        await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
        await clickOnlySchoolPoint(page, offset, "mouse", delay);
        await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
        const before = await settledCamera(page);
        const bounds = (await page.locator("#school-map").boundingBox())!;
        // mouse.click already released the button; these are hover movements.
        await page.mouse.move(bounds.x + bounds.width / 2 - 200, bounds.y + bounds.height - 140, { steps: 8 });
        await page.mouse.move(bounds.x + bounds.width / 2 - 80, bounds.y + bounds.height - 180, { steps: 8 });
        expect(await settledCamera(page)).toEqual(before);
        await expect(page.locator("#deckgl-overlay")).not.toHaveCSS("cursor", "grabbing");
      });
    }

    test(`${scene}: 학교 점에서 실제 드래그한 뒤 버튼을 놓으면 이동이 끝난다`, async ({ page }) => {
      await page.goto(`/?scene=${scene}&schoolChart=dots&region=52110&q=${encodeURIComponent("전주초등학교")}`);
      await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
      await clickOnlySchoolPoint(page);
      const before = await settledCamera(page);
      const bounds = (await page.locator("#school-map").boundingBox())!;
      const anchor = await page.getByTestId("school-hud-anchor").locator("circle").first().evaluate((circle) => ({
        x: Number(circle.getAttribute("cx")), y: Number(circle.getAttribute("cy")),
      }));
      const x = bounds.x + anchor.x;
      const y = bounds.y + anchor.y;
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x - 100, y + 40, { steps: 8 });
      await expect(page.locator("#deckgl-overlay")).toHaveCSS("cursor", "grabbing");
      await page.mouse.up();
      const dragged = await settledCamera(page);
      expect(Math.hypot(dragged[0] - before[0], dragged[1] - before[1])).toBeGreaterThan(1e-6);
      await page.mouse.move(x - 180, y + 70, { steps: 8 });
      expect(await settledCamera(page)).toEqual(dragged);
      await expect(page.locator("#deckgl-overlay")).not.toHaveCSS("cursor", "grabbing");
      // A new click must still work after the preceding gesture ended.
      await page.getByRole("button", { name: "학교 HUD 닫기" }).click();
      await expect(page.getByTestId("school-hud")).toHaveCount(0);
      await clickOnlySchoolPoint(page);
      await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
    });
  }
});

test.describe("모바일 터치 종료", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test("학교 점 주변을 탭하면 상세가 열리고 다음 탭도 동작한다", async ({ page }) => {
    await page.goto(`/?scene=flat&schoolChart=dots&region=52110&q=${encodeURIComponent("전주초등학교")}`);
    await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
    await clickOnlySchoolPoint(page, 10, "touch");
    await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
    await settledCamera(page);
    await page.getByRole("button", { name: "학교 HUD 닫기" }).tap();
    await expect(page.getByTestId("school-hud")).toHaveCount(0);
    await clickOnlySchoolPoint(page, 10, "touch");
    await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
  });
});
