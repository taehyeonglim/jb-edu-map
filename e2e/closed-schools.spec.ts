import { docShot, expect, test, openPanel } from "./fixtures";

test("폐교 지표: /?indicator=closed_schools 진입 → 범례 라벨 → 시군 선택 → 폐교 목록 섹션 표시", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));

  // 군산시(52130) has 14 폐교 rows (per the raw CSV — see task-5-report.md's
  // per-region table), so the 목록 is guaranteed non-empty here.
  await page.goto("/?indicator=closed_schools&region=52130");
  await openPanel(page);
    await page.getByRole("tab", { name: "시군 통계" }).click();
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });

  await expect(page.getByTestId("legend-indicator-label")).toHaveText("폐교 수(등재)");
  await expect(page.getByTestId("legend-description")).not.toBeEmpty();

  // Task 5 fix round 1 (coordinator ruling): the TopBar caption (next to
  // the fixed KESS KPI tiles) must show the KESS reference date even while
  // the SELECTED map indicator is 폐교(closed_schools) — whose own,
  // different reference date still shows correctly in the Legend, right
  // below it. These two must never collapse into the same (wrong) date
  // again.
  await expect(page.getByTestId("topbar-reference-date")).toHaveText("기준 2026-04-01");
  // Legend's own plain "기준일 {date}" span — exact match, since the
  // Footer's 폐교재산 source line also contains "기준일 2026-07-16" as a
  // substring (with "(게시 2026-07-20)" appended).
  await expect(page.getByTestId("metric-legend").getByText("기준 2026-07-16", { exact: true })).toBeVisible();

  await expect(page.getByRole("heading", { name: "군산시", exact: true })).toBeVisible();

  const section = page.getByTestId("closed-schools-section");
  await expect(section).toBeVisible();
  await expect(section.locator("summary")).toHaveText("폐교 목록 (14개)");

  // <details> starts closed — rows exist in the DOM but are not visible
  // (native <details> collapse) until opened.
  const rows = page.locator('[data-testid^="closed-school-row-"]');
  await expect(rows).toHaveCount(14);
  await expect(rows.first()).not.toBeVisible();
  await section.locator("summary").click();
  await expect(rows.first()).toBeVisible();

  // Footer (Task 5, Section C) — every named source with its own 기준일.
  await expect(page.getByTestId("footer-source")).toHaveCount(4);
  const closedSchoolsSource = page.getByTestId("footer-source").filter({ hasText: "폐교재산" });
  await expect(closedSchoolsSource).toContainText("기준일 2026-07-16");
  await expect(closedSchoolsSource).toContainText("게시 2026-07-20");
  await expect(page.getByTestId("footer-school-count-definition")).toBeVisible();
  await expect(page.getByTestId("footer-small-school-definition")).toBeVisible();

  await docShot(page, "closed-schools-panel");

  expect(consoleErrors).toEqual([]);
});
