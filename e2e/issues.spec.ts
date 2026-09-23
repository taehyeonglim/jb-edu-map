import { openPanel, expect, test } from "./fixtures";

const question = "학생이 줄어드는 지역의 학교는 어떤 상황인가?";
const special = "특수학급과 특수학교는 어디에 분포하는가?";
const ready = async (page: import("@playwright/test").Page) => {
  await expect(page.locator('[data-map-ready="true"]')).toBeAttached({
    timeout: 20000,
  });
};

test("교육문제에서 지정 현황·관련 학교·URL을 함께 탐색하고 복원한다", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await openPanel(page);
  await ready(page);
  await expect(page.getByRole("tab", { name: "학교 탐색" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  await page
    .getByRole("searchbox", { name: "학교명 검색" })
    .fill("전주초등학교");
  await page.getByRole("tab", { name: "교육문제", exact: true }).click();
  await page
    .getByRole("button", { name: new RegExp(question.replace("?", "")) })
    .click();
  await expect(
    page.getByRole("heading", { name: question, exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "인구감소지역 지정", exact: true }).click();
  await expect(
    page.getByText("인구감소지역 10곳 · 관심지역 1곳", { exact: true }).first(),
  ).toBeVisible();
  const compare = page.getByRole("region", { name: "교육문제 시군 비교" });
  await compare.getByRole("button", { name: /진안군/ }).click();
  await expect(page).toHaveURL(/region=52720/);
  await expect(
    page
      .getByRole("region", { name: "교육문제 지역 상세" })
      .getByRole("heading", { name: "진안군 함께 살펴보기" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "소규모학교 비율", exact: true })
    .click();
  await expect(page).toHaveURL(/issueMetric=small-share/);
  const count = await page.getByTestId("issue-school-count").innerText();
  expect(count).not.toContain("목록 0개");
  await page.reload();
  await openPanel(page);
  await ready(page);
  await expect(
    page.getByRole("button", { name: "소규모학교 비율", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("issue-school-count")).toHaveText(count);
  const related = page.getByRole("region", { name: "교육문제 관련 학교" });
  await related.locator('button[data-testid^="issue-school-"]').first().click();
  await expect(page.getByRole("region", { name: "선택한 학교" })).toBeVisible();
  await expect(page).toHaveURL(/issue=regional-sustainability/);
  await openPanel(page);
  await page.getByRole("button", { name: "이 지역 학교 검색 →" }).click();
  await expect(
    page.getByRole("searchbox", { name: "학교명 검색" }),
  ).toHaveValue("");
  await expect(
    page.getByRole("combobox", { name: "시군", exact: true }),
  ).toHaveValue("52720");
  await expect(page).toHaveURL(/issue=regional-sustainability/);
  expect(errors).toEqual([]);
});

test("특수학교는 지도·집계·목록에 포함하고 일반학교 특수학급과 분리한다", async ({
  page,
}) => {
  await page.goto(
    "/?view=issues&issue=special-education&issueMetric=special-classes",
  );
  await openPanel(page);
  await ready(page);
  await expect(
    page.getByRole("heading", { name: special, exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("전북 전체 559학급", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("button", { name: "특수학교 수", exact: true }).click();
  await expect(page.getByTestId("issue-school-count")).toHaveText(
    "목록 11개 · 지도 표시 가능 11개",
  );
  await page.locator('button[data-testid^="issue-school-"]').first().click();
  await expect(page.getByRole("region", { name: "선택한 학교" })).toBeVisible();
  const dots = await page.evaluate(() => {
    const layer = window
      .__jbmap!.deck.props.layers?.flat()
      .find(
        (l) => l && typeof l === "object" && "id" in l && l.id === "schools-special",
      );
    return layer && "props" in layer
      ? (layer.props.data as unknown[]).length
      : -1;
  });
  expect(dots).toBe(11);
});

test("학교 규모·작은학교·폐교 주제는 각각의 지도 표현과 URL 상태를 제공한다", async ({
  page,
}) => {
  await page.goto(
    "/?view=issues&issue=school-size&issueLevel=elem&region=52110&compareRegion=52130",
  );
  await openPanel(page);
  await ready(page);
  await expect(
    page.getByRole("heading", { name: "같은 지역의 학교 규모는 얼마나 다른가?" }),
  ).toBeVisible();
  await expect(page.getByRole("region", { name: "학교 규모 구간" })).toContainText(
    "1,000명 이상6개교",
  );
  await expect(page.getByRole("region", { name: "두 지역 비교" })).toContainText(
    "지표전주시군산시",
  );
  await page.getByRole("combobox", { name: "규모 비교 학교급" }).selectOption("mid");
  await expect(page).toHaveURL(/issueLevel=mid/);
  await expect(page.getByRole("region", { name: "학교 규모 구간" })).toContainText(
    "61~999명40개교",
  );

  await page.goto(
    "/?view=issues&issue=regional-sustainability&issueMetric=decline-small&region=52720",
  );
  await openPanel(page);
  await ready(page);
  await page.getByRole("checkbox", { name: "신입생 0명 학교 강조" }).check();
  await expect(page).toHaveURL(/zeroEntrants=on/);
  await expect(page.getByTestId("metric-legend")).toContainText(
    "시군 면: 학생 증감률 · 원: 작은학교",
  );

  await page.goto(
    "/?view=issues&issue=closed-assets&issueMetric=unused-share&region=52130",
  );
  await openPanel(page);
  await ready(page);
  const assets = page.getByRole("region", { name: "폐교재산 목록" });
  await expect(assets).toContainText("수록 14건 · 미활용 9건 · 64.3%");
  await expect(assets).toContainText("선유도초 방축도분교장 · 미활용");
  await expect(page.getByTestId("issue-school-count")).toHaveCount(0);
});

test("교육문제 자료 실패는 기존 검색에 영향을 주지 않고 재시도할 수 있다", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/data/education-issues.json", async (route) => {
    if (fail) await route.fulfill({ status: 503, body: "unavailable" });
    else await route.continue();
  });
  await page.goto("/?view=issues");
  await openPanel(page);
  await expect(
    page.getByRole("alert").filter({ hasText: "교육문제 자료" }),
  ).toContainText("교육문제 자료를 불러오지 못했습니다");
  await page.getByRole("tab", { name: "학교 탐색" }).click();
  await expect(
    page.getByRole("searchbox", { name: "학교명 검색" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "교육문제", exact: true }).click();
  fail = false;
  await page.getByRole("button", { name: "다시 시도", exact: true }).click();
  await expect(
    page.getByRole("button", { name: new RegExp(question.replace("?", "")) }),
  ).toBeVisible();
});

test("모바일에서 질문·학교 선택 후 정보 패널을 다시 열어도 교육문제가 유지된다", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/?view=issues&issue=regional-sustainability&issueMetric=small-share&region=52720",
  );
  await openPanel(page);
  await ready(page);
  await page.locator('button[data-testid^="issue-school-"]').first().click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByTestId("school-hud")).toBeVisible();
  await expect(page.getByRole("button", { name: /학교 정보 보기/ })).toHaveCount(0);
  await page.getByRole("button", { name: "학교·통계", exact: true }).click();
  await expect(
    page.getByRole("tab", { name: "교육문제", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth > innerWidth,
    ),
  ).toBe(false);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("알 수 없는 질문은 목록, 다른 주제 지표는 기본 지표로 돌아간다", async ({
  page,
}) => {
  await page.goto("/?view=issues&issue=not-a-question");
  await openPanel(page);
  await expect(
    page.getByRole("heading", { name: "우리 지역 교육, 어디부터 살펴볼까요?" }),
  ).toBeVisible();
  await page.goto(
    "/?view=issues&issue=special-education&issueMetric=designation",
  );
  await openPanel(page);
  await expect(
    page.getByRole("button", { name: "일반학교 특수학급 수", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
});

for (const [id, title, count] of [
  ["basic-learning", "14개 지역 기초학력지원센터는 어디에 있는가?", "14곳"],
  ["reading", "학교와 지역의 독서 자원은 어떻게 분포하는가?", "18곳"],
  ["care", "학교와 지역의 돌봄 자원은 어디에 있는가?", "수록 7곳 · 지역 확인 6곳"],
  ["wellbeing", "학생이 이용할 수 있는 상담·지원기관은 어디인가?", "16곳"],
  ["career", "진로진학 상담을 신청할 수 있는 지역은 어디인가?", "14개 지역"],
  ["ai-education", "AI 중점학교는 어디에 분포하는가?", "81개교"],
] as const) {
  test(`${id} 공식 자원·시군 지도를 연다`, async ({ page }) => {
    await page.goto(`/?view=issues&issue=${id}`);
    await openPanel(page);
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
    await expect(page.getByRole("region", { name: "교육 자원 목록" })).toBeVisible();
    await expect(page.getByText(count, { exact: false }).first()).toBeVisible();
    await expect(page.getByRole("region", { name: "교육문제 시군 비교" })).toBeVisible();
  });
}

test("지역아동센터 수록 범위와 지도 점을 구분해 표시한다", async ({ page }) => {
  await page.goto("/?view=issues&issue=care&issueMetric=care-centers");
  await openPanel(page);
  await ready(page);
  await expect(page.getByText("전북 수록 154곳 · 7개 시군 자료", { exact: true }).first()).toBeVisible();
  const points = await page.evaluate(() => {
    const layer = window.__jbmap!.deck.props.layers?.flat().find(
      (value) => value && typeof value === "object" && "id" in value && value.id === "issue-resources",
    );
    return layer && "props" in layer ? (layer.props.data as unknown[]).length : -1;
  });
  expect(points).toBe(154);
  await expect(page.getByRole("region", { name: "교육문제 시군 비교" })).toContainText("자료 없음");
});
