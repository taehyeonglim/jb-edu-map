import { test, expect } from "@playwright/test";

test("deployed city API, school selection, both issues and mobile controls", async ({page}) => {
  const site=process.env.DEPLOYMENT_URL;
  test.skip(!site,"Requires a deployed site URL");
  test.setTimeout(90000);
  const errors: string[]=[];
  page.on("pageerror",error=>errors.push(error.message));
  page.on("response",response=>{
    if (response.url().includes("/api/buildings/") && response.status() >= 400) errors.push(`Building API ${response.status()}`);
  });
  await page.goto(`${site}/?scene=city&school=B000005959`);
  await expect(page.getByText(/건물 조회:/)).toBeVisible({timeout:30000});
  await expect(page.getByRole("heading",{name:"전주초등학교"})).toBeVisible();
  await expect(page.getByText(/일부 건물 정보를 불러오지 못했습니다/)).toHaveCount(0);
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.screenshot({path:"test-results/deployed-city-desktop.png"});
  await page.getByRole("radio",{name:"평면",exact:true}).click();
  await expect(page).toHaveURL(/scene=flat/);
  await expect(page.getByRole("heading",{name:"전주초등학교"})).toBeVisible();
  await page.getByRole("radio",{name:"입체 현황판"}).click();
  await expect(page.getByText(/건물 조회:/)).toBeVisible();
  for(const [issue,title] of [["regional-sustainability","학생이 줄어드는 지역의 학교는 어떤 상황인가?"],["special-education","특수학급과 특수학교는 어디에 분포하는가?"]]) {
    await page.goto(`${site}/?scene=city&view=issues&issue=${issue}`);
    await expect(page.getByRole("heading",{name:title,exact:true})).toBeVisible();
    await expect(page.getByTestId("issue-school-count")).not.toContainText("목록 0개");
  }
  await page.setViewportSize({width:390,height:844});
  await page.goto(`${site}/?scene=city&school=B000005959`);
  await expect(page.getByText(/건물 조회:/)).toBeVisible({timeout:30000});
  await expect(page.getByTestId("school-hud")).toContainText("전주초등학교");
  await page.getByText("지도 설정",{exact:true}).click();
  await page.getByRole("radio",{name:"평면",exact:true}).click();
  await expect(page).toHaveURL(/scene=flat/);
  await page.getByRole("radio",{name:"입체 현황판"}).click();
  await expect(page.getByText(/건물 조회:/)).toBeVisible();
  await page.waitForLoadState("networkidle", { timeout: 30000 });
  await page.screenshot({path:"test-results/deployed-city-mobile.png"});
  expect(errors).toEqual([]);
});
