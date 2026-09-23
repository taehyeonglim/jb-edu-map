import { expect, test } from "@playwright/test";

test("deployed special schools expose verified locations and official directions", async ({ page, request }) => {
  const site = process.env.DEPLOYMENT_URL;
  test.skip(!site, "Requires a deployed site URL");
  const response = await request.get(`${site}/data/schools.json`);
  expect(response.ok()).toBe(true);
  const data = await response.json();
  const specials = data.schools.filter((s: { level: string }) => s.level === "special");
  expect(specials).toHaveLength(11);
  for (const school of specials) {
    expect(typeof school.lat).toBe("number");
    expect(typeof school.lng).toBe("number");
    expect(school.locationSource.verifiedAt).toBe("2026-09-22");
  }
  await page.goto(`${site}/?scene=flat&school=kedi%3A450063186`);
  await expect(page.getByRole("heading", { name: "덕유샘학교" })).toBeVisible();
  await expect(page.getByRole("link", { name: "학교 공식 위치 안내" })).toHaveAttribute(
    "href", "https://school.jbedu.kr/deogyusam/MABACAI/index.do",
  );
  await expect(page.getByText("전북특별자치도 장수군 계북면 장무로 1326", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  await page.getByRole("group", { name: "학교급 필터" }).getByRole("button", { name: "특수", exact: true }).click();
  await expect(page.getByTestId("school-result-count")).toHaveText("검색 결과 11개 · 지도 표시 가능 11개");
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.screenshot({ path: "test-results/deployed-special-schools.png" });
});
