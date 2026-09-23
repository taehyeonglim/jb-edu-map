import { openPanel, openMapSettings, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

const columns = (page: Page) => page.evaluate(() => {
  type School = { id: string; students: number; teachers: number };
  const layer = (window.__jbmap?.deck.props.layers as unknown as { id: string; props: { data: School[]; getElevation: (s: School) => number } }[])?.find(l => l?.id === "school-columns");
  return layer ? layer.props.data.map(s => ({ id: s.id, students: s.students, teachers: s.teachers, height: layer.props.getElevation(s) })) : [];
});

test("원통은 현재 지표에 비례하고 검색·점 전환·뒤로가기에 반응한다", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto("/?schoolChart=columns&scene=city&region=52110");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await expect(page.getByTestId("school-chart-legend")).toContainText("원통 높이 · 학생수");
  const rows = (await columns(page)).filter(s => s.students > 0);
  expect(rows.length).toBeGreaterThan(10);
  expect(rows[0].height / rows[1].height).toBeCloseTo(rows[0].students / rows[1].students, 7);
  await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
  await expect.poll(async () => (await columns(page)).length).toBe(1);
  const filtered = (await columns(page))[0];
  expect(filtered.height).toBeCloseTo(rows.find(s => s.id === filtered.id)!.height, 5);
  await page.getByRole("radio", { name: "점", exact: true }).click();
  await expect.poll(async () => (await columns(page)).length).toBe(0);
  await expect(page).toHaveURL(/schoolChart=dots/);
  await page.goBack();
  await expect.poll(async () => (await columns(page)).length).toBe(1);
  await page.reload();
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.getByRole("radio", { name: "원통", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.goto("/?schoolChart=columns&scene=city&indicator=teachers_total&region=52110");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.getByTestId("school-chart-legend")).toContainText("원통 높이 · 교원수");
  await expect.poll(async () => (await columns(page)).length).toBeGreaterThan(10);
  const teachers = (await columns(page)).filter(s => s.teachers > 0);
  expect(teachers[0].height / teachers[1].height).toBeCloseTo(teachers[0].teachers / teachers[1].teachers, 7);
  await page.screenshot({ path: "test-results/school-columns-region.png" });
  expect(errors).toEqual([]);
});

test("지역 전용 지표와 평면은 점을 유지하고 교육문제는 선택한 값을 쓴다", async ({ page }) => {
  await page.goto("/?schoolChart=columns&scene=city&indicator=students_change_5y");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.getByTestId("school-chart-legend")).toContainText("학교별 높이 자료가 없어");
  expect(await columns(page)).toHaveLength(0);
  await page.goto("/?schoolChart=columns&scene=flat");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.getByTestId("school-chart-legend")).toContainText("입체 현황판에서 표시");
  expect(await columns(page)).toHaveLength(0);
  await page.goto("/?schoolChart=columns&scene=city&view=issues&issue=special-education&issueMetric=special-students");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.getByTestId("school-chart-legend")).toContainText("일반학교 특수학급 학생수");
  await expect.poll(async () => (await columns(page)).length).toBeGreaterThan(0);
});

test("원통 클릭은 학교를 선택하고 모바일에서도 전환할 수 있다", async ({ page }) => {
  await page.goto("/?schoolChart=columns&scene=city&region=52110");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.getByRole("searchbox", { name: "학교명 검색" }).fill("전주초등학교");
  await expect.poll(async () => (await columns(page)).length).toBe(1);
  const point = await page.evaluate(() => {
    type S = { id: string; lng: number; lat: number };
    const deck = window.__jbmap!.deck;
    const layer = (deck.props.layers as unknown as { id: string; props: { data: S[]; getElevation: (s: S) => number } }[]).find(l => l?.id === "school-columns")!;
    const s = layer.props.data[0];
    const [x, y] = deck.getViewports()[0].project([s.lng, s.lat, layer.props.getElevation(s) / 2]);
    return { x, y };
  });
  const bounds = (await page.locator("#school-map").boundingBox())!;
  await page.mouse.move(bounds.x + point.x, bounds.y + point.y);
  await expect(page.locator(".deck-tooltip")).toContainText("학생수");
  await page.mouse.click(bounds.x + point.x, bounds.y + point.y);
  await expect(page.getByRole("heading", { name: "전주초등학교" })).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await openMapSettings(page);
  await page.getByRole("radio", { name: "점", exact: true }).click();
  await page.getByRole("radio", { name: "원통", exact: true }).click();
  await page.getByRole("button", { name: "범례 펼치기" }).click();
  await expect(page.getByTestId("school-chart-legend")).toBeVisible();
  await page.screenshot({ path: "test-results/school-columns-mobile.png" });
});


test("학교수는 낮은 동일 높이로 표시한다", async ({ page }) => {
  await page.goto("/?schoolChart=columns&scene=city&region=52110&indicator=schools_total");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.getByTestId("school-chart-legend")).toContainText("원통 1개 = 학교 1교 · 낮은 동일 높이");
  await expect.poll(async () => (await columns(page)).length).toBeGreaterThan(10);
  const rows = (await columns(page)).filter(s => s.height > 0);
  expect(new Set(rows.map(s => s.height)).size).toBe(1);
  const zoom = await page.evaluate(() => window.__jbmap!.deck.getViewports()[0].zoom);
  const metersPerPixel = 40075016.686 * Math.cos(35.8 * Math.PI / 180) / (512 * 2 ** zoom);
  expect(rows[0].height / metersPerPixel).toBeCloseTo(12, 1);
  await page.screenshot({ path: "test-results/school-count-short-columns.png" });
});
