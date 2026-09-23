import { openMapSettings, openPanel, expect, test } from "./fixtures";
import type { Page } from "@playwright/test";

// Flake mitigation: local 5-worker runs can hit CDP "session closed" on page.reload() here.
// A retry uses a fresh browser context — no localStorage carries over from the failed attempt.
test.describe.configure({ retries: process.env.CI ? 2 : 1 });

async function waitForMapReady(page: Page) {
  await expect(page.locator("canvas")).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
}

/**
 * Reads the live `emd-boundaries` PathLayer's `data.length` off the
 * NEXT_PUBLIC_E2E-only window.__jbmap bridge, or `null` when the layer slot
 * is currently `null` (toggle off / nothing selected / not yet fetched) —
 * same pattern as e2e/schools.spec.ts's readSchoolsLayerDataLength /
 * e2e/basemap.spec.ts's basemapLayerId.
 */
function readEmdLayerDataLength(page: Page): Promise<number | null> {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const layers = deck.props.layers as unknown as ({ id: string; props: { data: unknown[] } } | null)[];
    const layer = layers.find((l) => l?.id === "emd-boundaries");
    return layer ? layer.props.data.length : null;
  });
}

/** Task E brief's layer order: … regions → emd-boundaries(또는 null) → schools … */
function readLayerOrderIndices(page: Page) {
  return page.evaluate(() => {
    const deck = window.__jbmap?.deck;
    if (!deck) throw new Error("window.__jbmap not exposed — is NEXT_PUBLIC_E2E=1 set for the dev server?");
    const layers = deck.props.layers as unknown as ({ id: string } | null)[];
    return {
      regions: layers.findIndex((l) => l?.id === "regions"),
      emdBoundaries: layers.findIndex((l) => l?.id === "emd-boundaries"),
      schools: layers.findIndex((l) => l?.id === "schools"),
    };
  });
}

test.describe("읍면동 경계", () => {
  test("전주(52110) 선택 → emd-boundaries 레이어 표시(순서: regions 뒤·schools 앞) → 토글 OFF 시 사라짐 → 새로고침 후 OFF 유지 → 다시 ON, 콘솔 error 0", async ({
    page,
  }) => {
    // CI fix (run 35570411276) — this test's reload/toggle cycle exceeded
    // the default 30s test timeout on CI's slow software-GL runner; 3x it.
    test.slow();
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/?region=52110");
    await openPanel(page);
  await openMapSettings(page);
    await page.getByRole("tab", { name: "시군 통계" }).click();
    await waitForMapReady(page);
    await expect(page.getByRole("heading", { name: "전주시", exact: true })).toBeVisible();

    // Default ON — no stored preference yet (task brief: "기본 ON").
    const toggle = page.getByRole("button", { name: "읍면동 경계" });
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");

    // The layer's data arrives asynchronously (a real fetch of the static
    // public/data/emd/52110.geojson file — not stubbed) — expect.poll, no
    // fixed wait, per the task brief.
    await expect.poll(() => readEmdLayerDataLength(page), { timeout: 15000 }).toBeGreaterThan(0);

    const order = await readLayerOrderIndices(page);
    expect(order.regions).toBeGreaterThanOrEqual(0);
    expect(order.emdBoundaries).toBeGreaterThan(order.regions);
    expect(order.schools).toBeGreaterThan(order.emdBoundaries);

    // OFF: the layer slot goes back to `null` (not merely invisible).
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => readEmdLayerDataLength(page)).toBeNull();

    // Persisted: a fresh page load still reads OFF back from localStorage.
    await page.reload();
  await openMapSettings(page);
    await waitForMapReady(page);
    await expect(page.getByRole("button", { name: "읍면동 경계" })).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => readEmdLayerDataLength(page)).toBeNull();

    // Back ON.
    await page.getByRole("button", { name: "읍면동 경계" }).click();
    await expect(page.getByRole("button", { name: "읍면동 경계" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => readEmdLayerDataLength(page), { timeout: 15000 }).toBeGreaterThan(0);

    expect(consoleErrors).toEqual([]);
  });

  test("아무 시군도 선택하지 않으면 토글이 ON이어도 emd-boundaries 레이어는 null, 콘솔 error 0", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (message) => {
      if (message.type() === "error") consoleErrors.push(message.text());
    });
    page.on("pageerror", (error) => consoleErrors.push(error.message));

    await page.goto("/");
  await openMapSettings(page); // no ?region= — nothing selected
    await waitForMapReady(page);

    await expect(page.getByRole("button", { name: "읍면동 경계" })).toHaveAttribute("aria-pressed", "true");
    await expect.poll(() => readEmdLayerDataLength(page)).toBeNull();

    expect(consoleErrors).toEqual([]);
  });
});
