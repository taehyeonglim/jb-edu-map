import { test, expect, openPanel, openMapSettings } from "./fixtures";
import type { Page } from "@playwright/test";

async function ready(page: Page) {
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
}
async function layerIds(page: Page) {
  return page.evaluate(() =>
    window
      .__jbmap!.deck.props.layers?.flat()
      .filter(Boolean)
      .map((l) => (l && "id" in l ? l.id : "")),
  );
}

test("default city emphasizes the student distribution and opens tools on demand", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await ready(page);
  await expect(page.getByRole("complementary")).not.toBeVisible();
  await expect(page.getByTestId("metric-legend")).toContainText("165,958명");
  await expect.poll(() => layerIds(page)).toContain("education-density");
  await expect(
    page.getByRole("radio", { name: "원통", exact: true }),
  ).toBeVisible();
  await page.screenshot({ path: "test-results/education-city-overview.png" });
  await page.getByRole("button", { name: "교육여건", exact: true }).click();
  await expect(page.getByTestId("metric-legend")).toContainText(
    "학급당 학생수",
  );
  await expect.poll(() => layerIds(page)).not.toContain("education-density");
  await page.getByRole("button", { name: "지역 변화", exact: true }).click();
  await expect(page.getByTestId("metric-legend")).toContainText("2022→2026");
  await expect(page.getByTestId("metric-legend")).toContainText("시군 단위");
  await page.screenshot({ path: "test-results/education-city-change.png" });
  expect(errors).toEqual([]);
});

test("school selection switches density to values, keeping the statewide scale", async ({
  page,
}) => {
  await page.goto("/");
  await openPanel(page);
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  await page.locator('[data-testid^="school-row-"]').first().click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(16, 2);
  await expect.poll(() => layerIds(page)).not.toContain("education-density");
  await expect(page.getByTestId("metric-legend")).toContainText("1,607명");
  await openMapSettings(page);
  await page.getByRole("radio", { name: "원통", exact: true }).click();
  await expect.poll(() => layerIds(page)).toContain("school-columns");
  await page.getByRole("radio", { name: "자동", exact: true }).click();
  await expect.poll(() => layerIds(page)).not.toContain("school-columns");
});

test("special education keeps its scope across panels and uses distinct school symbols", async ({
  page,
}) => {
  await page.goto("/?indicator=special_classes");
  await ready(page);
  await expect(page.getByTestId("metric-legend")).toContainText("800학급");
  await expect(page.getByTestId("metric-legend")).toContainText(
    "특수학교 포함",
  );
  await expect.poll(() => layerIds(page)).toContain("schools-special");
  await page.getByRole("button", { name: "특수교육", exact: true }).click();
  await expect(page.getByTestId("metric-legend")).toContainText("559학급");
  await openPanel(page);
  await page.getByRole("tab", { name: "시군 통계", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "선택 지표 시군 비교" }),
  ).toContainText("559학급");
  await expect(page).toHaveURL(/issue=special-education/);
  await page.getByRole("tab", { name: "학교 탐색", exact: true }).click();
  await expect(page.getByTestId("metric-legend")).toContainText("559학급");
  await page.reload();
  await expect(page.getByTestId("metric-legend")).toContainText("559학급");
  await page.getByRole("button", { name: "학생 분포", exact: true }).click();
  await expect(page).not.toHaveURL(/issue=/);
});

test("mobile topic selector, complete metric menu and selected school card fit", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await ready(page);
  const issueButton = page.getByRole("button", { name: "교육문제 탐색" });
  await expect(issueButton).toBeVisible();
  const issueBox = await issueButton.boundingBox();
  expect(issueBox!.x + issueBox!.width).toBeLessThanOrEqual(390);
  await page
    .getByRole("combobox", { name: "교육현황 빠른 선택" })
    .selectOption("small_schools");
  await expect(page.getByTestId("metric-legend")).toContainText("310교");
  await page.getByRole("button", { name: /^전체 지표/ }).click();
  const menu = page.getByRole("dialog", { name: "전체 지표 선택" });
  await expect(menu).toBeVisible();
  const box = await menu.boundingBox();
  expect(box!.x).toBeGreaterThanOrEqual(0);
  expect(box!.x + box!.width).toBeLessThanOrEqual(390);
  await menu.getByRole("button", { name: "특수학교 수", exact: true }).click();
  await expect(page.getByTestId("metric-legend")).toContainText("11개교");
  await page.screenshot({ path: "test-results/education-city-mobile.png" });
  await openPanel(page);
  await page.locator('button[data-testid^="issue-school-"]').first().click();
  const card = page.getByTestId("school-hud");
  await expect(card).toBeVisible();
  const cardBox = await card.boundingBox();
  const mapBox = await page.locator("#school-map").boundingBox();
  expect(cardBox!.x).toBeGreaterThanOrEqual(mapBox!.x);
  expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(mapBox!.x + mapBox!.width);
});

test("a GPU without float blending uses readable school values instead of clipped density", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = WebGL2RenderingContext.prototype.getExtension;
    WebGL2RenderingContext.prototype.getExtension = function (name: string) {
      return name === "EXT_float_blend" ? null : original.call(this, name);
    };
  });
  await page.goto("/");
  await ready(page);
  await expect(page.getByTestId("metric-legend")).toContainText(
    "이 기기에서는 학교별 수치로 표시합니다",
  );
  expect(await layerIds(page)).not.toContain("education-density");
  expect(await layerIds(page)).toContain("schools");
});

for (const width of [768, 1024]) {
  test(`metric menu remains inside the ${width}px viewport`, async ({page}) => {
    await page.setViewportSize({width, height: 1024});
    await page.goto("/");
    await ready(page);
    await page.getByRole("button", {name: /^전체 지표/}).click();
    const menu = page.getByRole("dialog", {name: "전체 지표 선택"});
    const bounds = await menu.boundingBox();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width);
  });
}
