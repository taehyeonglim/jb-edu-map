import { test, expect } from "./fixtures";
import { INDICATORS } from "../src/lib/indicators/registry";
import { readFileSync } from "node:fs";
import type { School } from "../src/lib/schools/types";

test("every metric opens its analysis and a repeated selection reopens a closed panel", async ({ page }) => {
  test.setTimeout(90000);
  await page.goto("/?scene=flat");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached();
  const rail = page.getByRole("navigation", { name: "전체 지도 지표" });
  for (const metric of INDICATORS) {
    const panel = page.getByRole("tabpanel", { name: "시군 통계", exact: true });
    if (await panel.isVisible()) await panel.evaluate(element => { element.scrollTop = element.scrollHeight; });
    await rail.getByRole("button", { name: metric.label, exact: true }).click();
    await expect(page.getByRole("tabpanel", { name: "시군 통계", exact: true })).toBeVisible();
    const summary = page.getByRole("region", { name: "선택 지표 요약" });
    await expect(summary).toContainText(metric.id === "students_change_5y" ? /학생수 \d{4}→\d{4} 증감률/ : metric.label);
    await expect(summary).toBeInViewport();
    await expect(page.getByRole("region", { name: /· 시군 비교$/ }).getByRole("button")).toHaveCount(14);
  }
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await rail.getByRole("button", { name: "특수학급 학생수", exact: true }).click();
  await expect(page.getByRole("region", { name: "일반학교·특수학교 학생 수" })).toBeVisible();
  await expect(page.getByTestId("metric-legend")).toContainText("51명 이상");
});

test("regional metrics distinguish school context from the selected value", async ({ page }) => {
  await page.goto("/?scene=flat&indicator=closed_schools");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached();
  const toggle = page.getByRole("button", { name: "학교 위치 보기", exact: true });
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.click();
  await expect(page.getByTestId("metric-legend")).toContainText("선택 지표의 학교별 값이 아닙니다");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
});

test("mobile metric selection offers a summary before expanding the analysis", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?scene=flat");
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached();
  await page.getByRole("combobox", { name: "교육현황 빠른 선택", exact: true }).selectOption("students_per_class");
  await expect(page.getByRole("button", { name: "분석 펼치기", exact: true })).toBeVisible();
  await expect(page.getByRole("dialog", { name: "학교 탐색 및 시군 통계" })).not.toBeVisible();
  await page.getByRole("button", { name: "분석 펼치기", exact: true }).click();
  await expect(page.getByRole("region", { name: "학교별 값 분포", exact: true })).toBeVisible();
  const dialog = page.getByRole("dialog", { name: "학교 탐색 및 시군 통계" });
  expect(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
  await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  await expect(page.getByRole("button", { name: "분석 펼치기", exact: true })).toBeVisible();
});

test("school labels distinguish a regional change overlay from student counts and include every glyph", async ({ page }) => {
  const schools = JSON.parse(readFileSync("public/data/schools.json", "utf8")).schools as School[];
  const school = schools.find(row => row.small && !row.branch && row.lat !== null && row.lng !== null)!;
  await page.goto(`/?scene=flat&view=issues&issue=regional-sustainability&issueMetric=decline-small&region=${school.regionCode}&school=${school.id}`);
  await expect(page.locator('[data-labels-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect.poll(() => page.evaluate(id => {
    const layer = (window.__jbmap!.deck.props.layers as unknown as { id: string; props: { data: School[]; getText: (row: School) => string; characterSet: string[] } }[]).find(row => row?.id === "school-labels");
    const row = layer?.props.data.find(item => item.id === id);
    if (!layer || !row) return null;
    const label = layer.props.getText(row);
    return { label, missingGlyphs: [...label].filter(char => char !== "\n" && !layer.props.characterSet.includes(char)) };
  }, school.id)).toEqual({ label: `${school.name}\n작은학교 학생수 ${school.students!.toLocaleString("ko-KR")}명`, missingGlyphs: [] });
});
