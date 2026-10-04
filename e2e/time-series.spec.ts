import { openPanel, expect, test } from "./fixtures";

test("시군 통계에서 전북 전체와 선택 지역의 연도별 추이를 살펴본다", async ({ page }) => {
  await page.goto("/?view=statistics&indicator=students_total");
  await openPanel(page);
  const province = page.getByRole("region", { name: "전북 전체 학생수 시계열 추이" });
  await expect(province).toBeVisible();
  await expect(province.getByRole("img", { name: /2022년부터 2026년까지/ })).toBeVisible();
  await province.getByRole("button", { name: /2022/ }).click();
  await expect(province).toContainText("2022년");

  await page.goto("/?view=statistics&indicator=students_total&region=52110");
  await openPanel(page);
  const city = page.getByRole("region", { name: "전주시 학생수 시계열 추이" });
  await expect(city).toBeVisible();
  await city.getByRole("button", { name: /2025/ }).click();
  await expect(city).toContainText("2025년");
  await expect(city).toContainText("전년 대비");
});

test("증감률 지표에서 학생수 원자료 추이를 바로 보여준다", async ({ page }) => {
  await page.goto("/?view=statistics&indicator=students_change_5y&region=52110");
  await openPanel(page);
  const chart = page.getByRole("region", { name: "전주시 학생수 시계열 추이" });
  await expect(chart).toBeVisible();
  await expect(chart.getByRole("img", { name: /2022년부터 2026년까지/ })).toBeVisible();
  await expect(chart).not.toContainText("추이 없음");
  await expect(page).toHaveURL(/indicator=students_change_5y/);
  await chart.getByRole("button", { name: /2022/ }).click();
  await expect(chart).toContainText("2022년");
});

test("특수교육 질문은 일반학교와 특수학교의 시계열을 구분한다", async ({ page }) => {
  await page.goto("/?view=issues&issue=special-education&issueMetric=special-classes");
  await openPanel(page);
  const chart = page.getByRole("region", { name: "전북 전체 일반학교 특수학급 수 시계열 추이" });
  await expect(chart).toContainText("2026년 전북 전체 일반학교 559학급");
  await expect(chart.getByLabel("추이 범례")).toContainText("전북 전체 특수학교");
  await expect(chart.locator("path[stroke-dasharray]")).toHaveCount(1);
  await expect(chart).toContainText("전북 전체 특수학교 241학급");
  await chart.getByRole("button", { name: /2022/ }).click();
  await expect(chart).toContainText("2022년 전북 전체 일반학교 422학급");
});
