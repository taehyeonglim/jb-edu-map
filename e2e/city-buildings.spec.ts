import { openPanel, openMapSettings, test, expect } from "./fixtures";
import type { WebMercatorViewport } from "@deck.gl/core";
import type { Page } from "@playwright/test";

async function move(page: Page, zoom: number, lng = 127.148, lat = 35.824) {
  await page.evaluate(({ zoom, lng, lat }) => {
    const deck = window.__jbmap!.deck;
    const old = deck.getViewports()[0] as WebMercatorViewport;
    (deck as unknown as { _onViewStateChange: (args: unknown) => void })._onViewStateChange({ viewId: old.id, interactionState: {}, viewState: { longitude: lng, latitude: lat, zoom, pitch: old.pitch, bearing: 0, minZoom: 7.5, maxZoom: 18, transitionDuration: 0 } });
  }, { zoom, lng, lat });
}

test("city tiles are gated, reused, non-pickable and recover from failures", async ({ page }) => {
  test.setTimeout(90000);
  let requests = 0;
  let fail = false;
  await page.route("**/api/buildings/**", async (route) => {
    requests++;
    if (fail) return route.fulfill({status:502,body:'{}'});
    await route.fulfill({json:{type:"FeatureCollection",features:[{
      type:"Feature",id:"demo",properties:{displayHeight:18,heightSource:"provided"},
      geometry:{type:"Polygon",coordinates:[[[127.147,35.823],[127.148,35.823],[127.148,35.824],[127.147,35.824],[127.147,35.823]]]},
    }],metadata:{complete:true,fetchedAt:"2026-09-22T00:00:00Z",source:"test"}}});
  });
  await page.goto("/?scene=city");
  await openPanel(page);
  await openMapSettings(page);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready","true");
  await expect(page.getByText("건물은 더 확대하면 표시됩니다")).toBeVisible();
  expect(requests).toBe(0);
  await move(page,15.4);
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
  await move(page,16);
  await expect.poll(() => requests).toBeGreaterThan(0);
  await expect(page.getByText(/건물 조회:/)).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.props.layers?.flat().filter(Boolean).some((l) => l && 'id' in l && String(l.id).startsWith("buildings-")))).toBe(true);
  const camera = await page.evaluate(() => {const v=window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport;return [v.longitude,v.latitude,v.zoom];});
  await page.getByRole("radio",{name:"평면",exact:true}).click();
  await expect(page).toHaveURL(/scene=flat/);
  await expect.poll(() => page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(0);
  const flatRequests=requests;
  await move(page,17,127.15);
  await page.waitForTimeout(300);
  expect(requests).toBe(flatRequests);
  await page.getByRole("radio",{name:"입체 현황판"}).click();
  await expect.poll(() => page.evaluate(() => (window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(45);
  await move(page,camera[2],camera[0],camera[1]);
  await page.waitForTimeout(600);
  await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.props.layers?.flat().every((l) => !l || !("id" in l) || !String(l.id).startsWith("buildings-") || ("isLoaded" in l && l.isLoaded)))).toBe(true);
  const loaded=requests;
  await page.getByRole("button",{name:"학교명",exact:true}).click();
  await page.waitForTimeout(300);
  expect(requests).toBe(loaded);
  await page.getByRole("tab", {name:"교육문제",exact:true}).click();
  await page.getByRole("button", {name:/학생이 줄어드는 지역의 학교는 어떤 상황인가/}).click();
  await expect.poll(() => page.evaluate(() => {
    const deck = window.__jbmap!.deck as unknown as {layerManager:{getLayers:()=>{id:string,props:{getFillColor?:number[]}}[]}};
    const volumes = deck.layerManager.getLayers().filter(l=>l.id.endsWith("-volume"));
    return volumes.length > 0 && volumes.every(l=>l.props.getFillColor?.[3]===76);
  })).toBe(true);
  expect(requests).toBe(loaded);
  await page.getByRole("tab", {name:"학교 탐색",exact:true}).click();
  await expect.poll(() => page.evaluate(() => {
    const deck = window.__jbmap!.deck as unknown as {layerManager:{getLayers:()=>{id:string,props:{getFillColor?:number[]}}[]}};
    const volumes = deck.layerManager.getLayers().filter(l=>l.id.endsWith("-volume"));
    return volumes.length > 0 && volumes.every(l=>l.props.getFillColor?.[3]===76);
  })).toBe(true);
  expect(requests).toBe(loaded);
  fail=true;
  await move(page,16,127.425,35.791);
  await expect(page.getByText(/일부 건물 정보를 불러오지 못했습니다/)).toBeVisible();
  fail=false;
  await page.getByRole("button",{name:"재시도",exact:true}).click();
  await expect(page.getByText(/일부 건물 정보를 불러오지 못했습니다/)).toHaveCount(0);
  await page.screenshot({path:"test-results/city-buildings-desktop.png"});
  await expect.poll(() => page.evaluate(() => window.__jbmap!.deck.props.layers?.flat().every(l => !l || !("id" in l) || !String(l.id).startsWith("buildings-") || ("isLoaded" in l && l.isLoaded)))).toBe(true);
  const beforeZoomOut=requests;
  await move(page,8);
  await expect(page.getByText("건물은 더 확대하면 표시됩니다")).toBeVisible();
  await page.waitForTimeout(300);
  expect(requests).toBe(beforeZoomOut);
});

test("mobile gates at 16, caps pitch, and remembers explicit flat mode", async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  let requests=0;
  await page.route("**/api/buildings/**",(route)=>{ requests++; return route.fulfill({json:{type:"FeatureCollection",features:[],metadata:{complete:true,fetchedAt:"2026-09-22T00:00:00Z"}}}); });
  await page.goto("/?scene=city");
  await openMapSettings(page);
  await expect(page.locator("#school-map")).toHaveAttribute("data-map-ready","true");
  await move(page,15.9);
  await page.waitForTimeout(300);
  expect(requests).toBe(0);
  await move(page,16);
  await expect.poll(()=>requests).toBeGreaterThan(0);
  await page.getByRole("radio",{name:"평면",exact:true}).click();
  await page.getByRole("radio",{name:"입체 현황판"}).click();
  await expect.poll(()=>page.evaluate(()=>(window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(40);
  await page.screenshot({path:"test-results/city-buildings-mobile.png"});
  await page.getByRole("radio",{name:"평면",exact:true}).click();
  await expect(page).toHaveURL(/scene=flat/);
  await page.reload();
  await openMapSettings(page);
  await expect(page.getByRole("radio",{name:"평면",exact:true})).toHaveAttribute("aria-checked","true");
  await page.goto("/");
  await openMapSettings(page);
  await expect(page.getByRole("radio",{name:"평면",exact:true})).toHaveAttribute("aria-checked","true");
});
