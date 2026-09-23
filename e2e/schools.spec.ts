import { openPanel, openMapSettings, expect, test, docShot } from "./fixtures";
import type { Page } from "@playwright/test";
const count = (page: Page) =>
  page.evaluate(() => {
    const layers = window.__jbmap!.deck.props.layers as ({
      id: string;
      props: { data: unknown[] };
    } | null)[];
    return layers.find((l) => l?.id === "schools")!.props.data.length;
  });

test("검색·학교급·시군 필터가 목록과 지도에 함께 적용된다", async ({
  page,
}) => {
  await page.goto("/?schoolChart=dots");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({ timeout: 20000 });
  await expect(page.getByTestId("school-result-count")).toHaveText(
    "검색 결과 753개 · 지도 표시 가능 753개",
  );
  expect(await count(page)).toBe(753);
  await page
    .getByRole("combobox", { name: "시군", exact: true })
    .selectOption("52730");
  await expect(page).toHaveURL(/region=52730/);
  await page
    .getByRole("group", { name: "학교급 필터" })
    .getByRole("button", { name: "초", exact: true })
    .click();
  await expect
    .poll(async () => await count(page))
    .toBe(await page.locator('[data-testid^="school-row-"]').count());
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("존재하지않는학교");
  await expect(
    page.getByText("검색 조건에 맞는 학교가 없습니다."),
  ).toBeVisible();
  await expect.poll(() => count(page)).toBe(0);
});

test("학교 선택은 지역 필터를 바꾸지 않고 확대하며 이름과 점의 픽셀 크기는 고정된다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  await page.goto("/?schoolChart=dots");
  await openPanel(page);
  await openMapSettings(page);
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  const row = page.locator('[data-testid^="school-row-"]').first();
  await row.click();
  await expect(row).toHaveAttribute("aria-current", "true");
  await expect(page).not.toHaveURL(/region=/);
  await expect(
    page.getByRole("heading", { name: "전주초등학교" }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(16, 2);
  const style = () =>
    page.evaluate(() => {
      const layers = window.__jbmap!.deck.props.layers as ({
        id: string;
        props: Record<string, unknown>;
      } | null)[];
      const labels = layers.find((l) => l?.id === "school-labels")!.props;
      const dots = layers.find((l) => l?.id === "schools")!.props;
      return {
        size: labels.getSize,
        min: labels.sizeMinPixels,
        max: labels.sizeMaxPixels,
        units: labels.sizeUnits,
        visible: labels.visible,
        radius: dots.getRadius,
      };
    });
  const expected = {
    size: 11,
    min: 11,
    max: 11,
    units: "pixels",
    visible: true,
    radius: 5,
  };
  expect(await style()).toEqual(expected);
  for (let i = 0; i < 3; i++) {
    await page.getByRole("button", { name: "확대", exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
      )
      .toBeCloseTo(Math.min(18, 17 + i), 2);
  }
  await expect
    .poll(() =>
      page.evaluate(() => window.__jbmap?.deck.getViewports()[0].zoom),
    )
    .toBeCloseTo(18, 2);
  expect(await style()).toEqual(expected);
  await docShot(page, "school-explorer-zoom18");
  await page.getByRole("button", { name: "학교명", exact: true }).click();
  expect((await style()).visible).toBe(false);
  await page.getByRole("button", { name: "학교명", exact: true }).click();
  await openPanel(page);
  await page.getByRole("searchbox", { name: "학교명 검색" }).fill("군산");
  await expect(page.getByRole("region", { name: "선택한 학교" })).toHaveCount(
    0,
  );
  expect(errors).toEqual([]);
});

test("특수학교 11곳은 공식 좌표로 표시되고 선택 시 확대된다", async ({ page }) => {
  await page.goto("/?schoolChart=dots");
  await openPanel(page);
  await openMapSettings(page);
  await page
    .getByRole("group", { name: "학교급 필터" })
    .getByRole("button", { name: "특수", exact: true })
    .click();
  await expect(page.getByTestId("school-result-count")).toHaveText(
    "검색 결과 11개 · 지도 표시 가능 11개",
  );
  await page.locator('[data-testid^="school-row-"]').first().click();
  await expect(page.getByRole("link", { name: "학교 공식 위치 안내" })).toBeVisible();
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached();
  await expect.poll(() => count(page)).toBe(11);
  await expect.poll(() => page.evaluate(() => {
    const view = window.__jbmap!.deck.getViewports()[0];
    return view.zoom;
  })).toBeGreaterThanOrEqual(16);
  await page.getByRole("button", { name: "해당 시군 통계 보기" }).click();
  await expect(page.getByRole("tab", { name: "시군 통계" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await expect(page.getByTestId("region-panel-current-value")).toBeVisible();
});


test("좌표가 없는 자료의 검색·상세 조회 대체 경로를 유지한다", async ({ page }) => {
  await page.route("**/data/schools.json", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    for (const school of data.schools) {
      if (school.level !== "special") continue;
      school.lat = null;
      school.lng = null;
      delete school.locationSource;
      school.locationMissingReason = "검증용 위치 누락";
    }
    await route.fulfill({ json: data });
  });
  await page.goto("/?schoolChart=dots");
  await openPanel(page);
  await openMapSettings(page);
  await page.getByRole("group", { name: "학교급 필터" }).getByRole("button", { name: "특수", exact: true }).click();
  await expect(page.getByTestId("school-result-count")).toHaveText("검색 결과 11개 · 지도 표시 가능 0개");
  await page.locator('[data-testid^="school-row-"]').first().click();
  await expect(page.getByText("위치 자료 없음 · 지도에 표시할 수 없습니다.")).toBeVisible();
});
