import { test, expect, docShot } from "./fixtures";

for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [360, 640]]) {
  test(`관제실 ${width}×${height}: 전체 지도와 HUD가 컨트롤을 가리지 않는다`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await page.goto("/?scene=flat&region=52110&school=B000005959");
    const hud = page.getByTestId("school-hud");
    await expect(hud).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      const card = document.querySelector('[data-testid="school-hud"]')!.getBoundingClientRect();
      const map = document.getElementById("school-map")!.getBoundingClientRect();
      const obstacles = Array.from(document.querySelectorAll('[data-map-obstacle], .deck-widget')).map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
      return {
        fullMap: map.width === innerWidth && map.height === innerHeight,
        fits: card.left >= 0 && card.right <= innerWidth && card.top >= 0 && card.bottom <= innerHeight,
        overlaps: obstacles.some((r) => card.left < r.right && card.right > r.left && card.top < r.bottom && card.bottom > r.top),
        horizontalScroll: document.documentElement.scrollWidth > innerWidth,
      };
    })).toEqual({ fullMap: true, fits: true, overlaps: false, horizontalScroll: false });
    await expect(page.getByRole("button", { name: "학교 HUD 닫기" })).toBeInViewport();
    if (width >= 1024) {
      const metrics = page.getByRole("navigation", { name: "전체 지도 지표" });
      await expect(metrics.getByRole("button")).toHaveCount(18);
      for (const button of await metrics.getByRole("button").all()) {
        await expect(button).toBeInViewport();
        expect((await button.boundingBox())!.height).toBe(28);
      }
      await expect(page.getByRole("button", { name: "학교명", exact: true })).toBeVisible();
      await metrics.getByRole("button", { name: "학급수", exact: true }).click();
      await expect(page).toHaveURL(/indicator=classes_total/);
      await expect(metrics.getByRole("button", { name: "학급수", exact: true })).toHaveAttribute("aria-pressed", "true");
    }
    await docShot(page, `control-room-${width}`);
    await page.getByRole("button", { name: "학교·통계", exact: true }).click();
    await expect(page.getByRole("searchbox", { name: "학교명 검색" })).toBeVisible();
    expect((await page.locator("#school-map").boundingBox())!.width).toBe(width);
    await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
    await expect(hud).toBeVisible();
    if (width < 1024) {
      await page.locator("summary").filter({ hasText: "지도 설정" }).click();
      await expect(hud).toHaveCount(0);
      await page.locator("summary").filter({ hasText: "지도 설정" }).click();
      await expect(hud).toBeVisible();
    }
    if (width === 1440) {
      const marker = page.locator('[data-testid="school-hud-anchor"] circle').first();
      const before = Number(await marker.getAttribute("cx"));
      await page.mouse.move(1240, 480);
      await page.mouse.down();
      await page.mouse.move(1176, 480, { steps: 10 });
      await page.mouse.up();
      await expect.poll(async () => Math.abs(Number(await marker.getAttribute("cx")) - before)).toBeGreaterThan(20);
      await expect(hud).toBeVisible();
    }
  });
}
