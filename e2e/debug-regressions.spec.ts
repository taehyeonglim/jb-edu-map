import { test, expect } from "./fixtures";

test("실제 WebGL 손실을 안내하고 선택 상태를 유지한 채 평면으로 복구한다", async ({ page }) => {
  await page.goto("/?scene=city&region=52110&school=B000005959");
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready", "true");
  await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => {
    const extension = canvas.getContext("webgl2")?.getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("Context-loss test requires WEBGL_lose_context");
    extension.loseContext();
  });
  await expect(page.getByText("그래픽 컨텍스트가 끊겼습니다", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "평면으로 다시 열기" }).click();
  await expect(page).toHaveURL(/scene=flat/);
  await expect(page).toHaveURL(/school=B000005959/);
  await expect(page).toHaveURL(/region=52110/);
  await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
  await expect(page.locator("canvas")).toBeVisible();
  expect(await page.locator("canvas").evaluate((canvas: HTMLCanvasElement) => canvas.getContext("webgl2")?.isContextLost())).toBe(false);
});

test("비율 단위와 지역소멸 기본 지표 이름을 정확히 표시한다", async ({ page }) => {
  await page.goto("/?indicator=students_change_5y&scene=flat");
  await expect(page.getByTestId("metric-legend")).toContainText("전북 전체 -12.5%");
  await expect(page.getByTestId("metric-legend")).not.toContainText("%%");
  await page.goto("/?view=issues&issue=regional-sustainability&scene=flat");
  await expect(page.getByRole("button", { name: "전체 지표 · 학생수 변화와 작은학교 ▾", exact: true })).toBeVisible();
  const selected = page.getByRole("tabpanel", { name: "교육문제", exact: true }).getByRole("button", { name: "학생수 변화와 작은학교", exact: true });
  await expect(selected).toHaveAttribute("aria-pressed", "true");
});
