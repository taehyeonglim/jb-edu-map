import { readFile } from "node:fs/promises";
import { parseCsv } from "../scripts/pipeline/lib/csv";
import { test, expect, openPanel, tabKey } from "./fixtures";

test("wrapped indicator groups never cover map actions after viewport changes", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.locator('#school-map[data-map-ready="true"]'),
  ).toBeAttached();
  for (const width of [1440, 1024, 1280, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(() =>
        page.evaluate(() => {
          const header = document
            .querySelector(".cyber-command")!
            .getBoundingClientRect();
          const action = document
            .querySelector(".cyber-explore-button")!
            .getBoundingClientRect();
          return action.top >= header.bottom;
        }),
      )
      .toBe(true);
    await page.getByRole("button", { name: "학교·통계", exact: true }).click();
    await page.getByRole("button", { name: "패널 닫기", exact: true }).click();
  }
});

test("search links restore filters, export the full result, and reset after changing issues", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async () => {
          throw new Error("denied");
        },
      },
    }),
  );
  await page.goto("/");
  await openPanel(page);
  await expect(
    page
      .getByRole("list", { name: "학교 목록", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(50);
  const downloadAll = page.waitForEvent("download");
  await page.getByRole("button", { name: "검색 결과 CSV 저장" }).click();
  const allRows = parseCsv(
    await readFile(await (await downloadAll).path(), "utf8"),
  );
  expect(allRows.length).toBeGreaterThan(51);
  await page.getByRole("button", { name: /학교 50개 더 보기/ }).click();
  await expect(
    page
      .getByRole("list", { name: "학교 목록", exact: true })
      .getByRole("listitem"),
  ).toHaveCount(100);
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  await page
    .getByRole("group", { name: "학교급 필터" })
    .getByRole("button", { name: "초", exact: true })
    .click();
  await page.getByRole("button", { name: "링크 복사", exact: true }).click();
  const link = await page.getByLabel("공유 주소").inputValue();
  expect(new URL(link).searchParams.get("q")).toBe("전주초등학교");
  expect(new URL(link).searchParams.get("schoolLevel")).toBe("elem");
  await page.goto(link);
  await openPanel(page);
  await expect(
    page.getByRole("searchbox", { name: "학교명 검색" }),
  ).toHaveValue("전주초등학교");
  await expect(page.getByTestId("school-result-count")).toHaveText(
    "검색 결과 1개 · 지도 표시 가능 1개",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "검색 결과 CSV 저장" }).click();
  const rows = parseCsv(await readFile(await (await download).path(), "utf8"));
  expect(rows).toHaveLength(2);
  expect(rows[1][2]).toBe("전주초등학교");
  expect(rows[1].at(-1)).toContain("학교급=elem");
  await page.getByRole("tab", { name: "교육문제", exact: true }).click();
  await page
    .getByRole("button", {
      name: /학생이 줄어드는 지역의 학교는 어떤 상황인가/,
    })
    .click();
  await expect(page).not.toHaveURL(/[?&]q=/);
  await expect(page).not.toHaveURL(/schoolLevel=/);
});

test("general comparison keeps regions while changing indicators and exports displayed values", async ({
  page,
}) => {
  await page.goto("/?view=statistics&region=52110&indicator=students_total");
  await openPanel(page);
  await page.getByLabel("비교할 지역", { exact: true }).selectOption("52130");
  const table = page.getByRole("table", { name: "선택 지역 수치 비교" });
  await expect(table.locator("tr[data-testid]")).toHaveCount(18);
  const values = await table
    .getByTestId("comparison-students_total")
    .locator("td")
    .allTextContents();
  await table
    .getByRole("button", { name: "소규모학교 비율", exact: true })
    .click();
  await expect(page).toHaveURL(/compareRegion=52130/);
  await expect(page).toHaveURL(/indicator=small_school_share/);
  const chart = page.getByRole("region", {
    name: /전주시 소규모학교 비율 시계열 추이/,
  });
  await expect(chart.locator("path[stroke-dasharray]")).toHaveCount(1);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "비교표 CSV 저장" }).click();
  const csv = parseCsv(await readFile(await (await download).path(), "utf8"));
  expect(csv).toHaveLength(19);
  const students = csv.find((row) => row[0] === "students_total")!;
  expect(students[7]).toBe(values[0]);
  expect(students[12]).toBe(values[1]);
  expect(students[16].replace(/^'/, "")).toBe(values[2]);
  await page.reload();
  await expect(page.getByLabel("비교할 지역", { exact: true })).toHaveValue(
    "52130",
  );
  await expect(
    page.getByRole("table", { name: "선택 지역 수치 비교" }),
  ).toBeVisible();
});

test("issue comparison CSV preserves designation labels and per-metric dates", async ({
  page,
}) => {
  await page.goto(
    "/?view=issues&issue=regional-sustainability&region=52720&compareRegion=52110",
  );
  await openPanel(page);
  const table = page.getByRole("table", { name: "선택 지역 수치 비교" });
  await expect(table.getByTestId("comparison-designation")).toContainText(
    "비교 불가",
  );
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "비교표 CSV 저장" }).click();
  const rows = parseCsv(await readFile(await (await download).path(), "utf8"));
  const designation = rows.find((row) => row[0] === "designation")!;
  expect(designation[14]).toBe("");
  expect(designation[17]).toContain("공식 자료 확인");
  expect(designation[19]).toContain("https://");
  expect(designation[20]).toContain("집계 학교급=지표별 정의 참조");
});

for (const width of [390, 360])
  test(`comparison and sharing fit ${width}px with keyboard focus retained`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/?view=statistics&region=52110&compareRegion=52130");
    await openPanel(page);
    const panel = page.getByRole("dialog", { name: "학교 탐색 및 시군 통계" });
    await expect(panel).toBeVisible();
    await panel.locator("summary").filter({ hasText: /탐색 조건.*공유/ }).click();
    await expect(
      panel.getByRole("button", { name: "링크 복사" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "비교표 CSV 저장" })
      .scrollIntoViewIfNeeded();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(await panel.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    expect(
      await page
        .getByRole("button", { name: "비교표 CSV 저장" })
        .evaluate((el) => el.getBoundingClientRect().height),
    ).toBeGreaterThanOrEqual(44);
    await page.getByRole("button", { name: "비교표 CSV 저장" }).focus();
    for (let i = 0; i < 6; i++) await page.keyboard.press(tabKey(page));
    expect(
      await panel.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(panel).not.toBeVisible();
  });
