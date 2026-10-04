import { INDICATORS, DEFAULT_INDICATOR_ID } from "../src/lib/indicators/registry";
import { METRIC_LABELS, PUBLISHED_ISSUES } from "../src/lib/issues/registry";
import { test, expect, openPanel } from "./fixtures";

test("all 18 indicators can be selected from the comparison table without losing regions", async ({ page }) => {
  test.setTimeout(90000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto("/?scene=flat&view=statistics&region=52110&compareRegion=52130");
  await openPanel(page);
  const table = page.getByRole("table", { name: "선택 지역 수치 비교" });
  await expect(table.locator("tr[data-testid]")).toHaveCount(18);
  for (const indicator of INDICATORS) {
    const control = table.getByTestId(`comparison-${indicator.id}`).getByRole("button");
    const label = await control.innerText();
    await control.click();
    await expect(page).toHaveURL(url => (url.searchParams.get("indicator") ?? DEFAULT_INDICATOR_ID) === indicator.id);
    // The map may append a scope note (e.g. "특수학교 포함") to the label.
    await expect(page.getByTestId("legend-indicator-label")).toContainText(label);
    if (["special_classes", "special_students"].includes(indicator.id)) {
      await expect(page.getByTestId("legend-indicator-label")).toContainText("특수학교 포함");
    }
    await expect(page).toHaveURL(/region=52110/);
    await expect(page).toHaveURL(/compareRegion=52130/);
    await expect(table).not.toContainText(/NaN|Infinity|undefined/);
  }
  expect(errors).toEqual([]);
});

for (const issue of PUBLISHED_ISSUES) {
  test(`every metric in ${issue.id} renders its map and regional comparison`, async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`/?scene=flat&view=issues&issue=${issue.id}&region=52110&compareRegion=52130`);
    await openPanel(page);
    const panel = page.getByRole("tabpanel", { name: "교육문제", exact: true });
    await expect(panel.getByRole("heading", { name: issue.question, exact: true })).toBeVisible();
    const table = page.getByRole("table", { name: "선택 지역 수치 비교" });
    await expect(table.locator("tr[data-testid]")).toHaveCount(issue.metrics.length);
    for (const metric of issue.metrics) {
      const control = panel.getByRole("button", { name: METRIC_LABELS[metric], exact: true });
      await control.click();
      await expect(control).toHaveAttribute("aria-pressed", "true");
      await expect(page).toHaveURL(url => url.searchParams.get("issueMetric") === metric);
      await expect(page.getByTestId("legend-indicator-label")).toContainText(
        ["student-change", "decline-small"].includes(metric) ? /학생수 \d{4}→\d{4} 증감률/ : METRIC_LABELS[metric],
      );
      await expect(table).not.toContainText(/NaN|Infinity|undefined/);
    }
    expect(errors).toEqual([]);
  });
}
