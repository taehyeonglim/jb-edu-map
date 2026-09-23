import { test, expect } from "@playwright/test";

test("deployed school cylinders follow the metric and remain readable on mobile", async ({ page }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");
  const errors: string[] = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${site}/?scene=city&schoolChart=columns&region=52110&indicator=students_total`);
  await expect(page.getByTestId("school-chart-legend")).toContainText("원통 높이 · 학생수");
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/deployed-school-columns.png" });
  await page.getByRole("radio", { name: "점", exact: true }).click();
  await expect(page).toHaveURL(/schoolChart=dots/);
  await expect(page.getByTestId("school-chart-legend")).toHaveCount(0);
  await page.goBack();
  await expect(page.getByTestId("school-chart-legend")).toBeVisible();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${site}/?scene=city&schoolChart=columns&region=52110&indicator=teachers_total`);
  await page.getByRole("button", { name: "범례 펼치기" }).click();
  await expect(page.getByTestId("school-chart-legend")).toContainText("원통 높이 · 교원수");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/deployed-school-columns-mobile.png" });
  expect(errors).toEqual([]);
});

test("deployed school counts use short uniform cylinders", async ({ page }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");
  await page.goto(`${site}/?scene=city&schoolChart=columns&region=52110&indicator=schools_total`);
  await expect(page.getByTestId("school-chart-legend")).toContainText("원통 1개 = 학교 1교 · 낮은 동일 높이");
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: "test-results/deployed-school-count.png" });
});
