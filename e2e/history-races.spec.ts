import { test, expect, openPanel } from "./fixtures";

const cases = [
  { name: "tab", role: "tab" as const, label: "시군 통계", parameter: "view", value: "statistics" },
  { name: "chart", role: "radio" as const, label: "점", parameter: "schoolChart", value: "dots" },
  { name: "scene", role: "radio" as const, label: "평면", parameter: "scene", value: "flat" },
  { name: "region", role: "button" as const, label: "지역 조건 해제", parameter: "region", value: null },
  { name: "issue", role: "button" as const, label: "특수교육", parameter: "issue", value: "special-education" },
  { name: "school", role: "button" as const, label: "전주초등학교", parameter: "school", value: "B000005959" },
];

for (const scenario of cases) {
  test(`rapid search before ${scenario.name} navigation survives Back`, async ({ page }) => {
    await page.clock.install();
    await page.goto("/?scene=city&schoolChart=columns&region=52110");
    await openPanel(page);
    await page.clock.pauseAt(new Date(Date.now() + 60000));
    const search = page.getByRole("searchbox", { name: "학교명 검색" });
    await search.fill("전");
    await page.clock.runFor(1);
    await expect(page).toHaveURL(url => url.searchParams.get("q") === "전");
    await search.fill("전주초등학교");
    const control = scenario.name === "school"
      ? page.getByRole("list", { name: "학교 목록", exact: true }).getByRole("button").filter({ hasText: scenario.label })
      : page.getByRole(scenario.role, { name: scenario.label, exact: true });
    // Dispatch while the URL throttle is still pending; fixed timers make
    // the short race window repeatable without relying on machine speed.
    await control.dispatchEvent("click");
    await page.clock.fastForward(1000);
    await page.clock.fastForward(1000);
    await page.clock.resume();
    await expect(page).toHaveURL(url => url.searchParams.get(scenario.parameter) === scenario.value);
    await page.goBack();
    await expect(page).toHaveURL(url => url.searchParams.get("q") === "전주초등학교");
    await expect(page).toHaveURL(url => url.searchParams.get("region") === "52110");
  });
}
