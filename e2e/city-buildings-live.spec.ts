import { test, expect } from "@playwright/test";
import type { WebMercatorViewport } from "@deck.gl/core";
import { writeFile } from "node:fs/promises";

test("live building scenes, picking, cache and movement metrics", async ({ page }) => {
  test.skip(process.env.LIVE_BUILDINGS !== "1", "Requires VWorld credentials and real network");
  test.setTimeout(180000);
  const errors: string[] = [];
  page.on("pageerror",e=>errors.push(e.message));
  page.on("console",m=>{if(m.type()==="error" && !m.text().includes("Failed to load resource")) errors.push(m.text());});
  await page.goto("/?scene=city");
  await expect(page.locator("#school-map")).toHaveAttribute("data-labels-ready","true");
  await page.screenshot({path:"test-results/live-overview.png"});
  const places: [string,number,number][] = [["jeonju",127.148,35.824],["gunsan",126.736,35.967],["jinan",127.425,35.791],["island",126.411,35.811]];
  const snapshots: unknown[]=[];
  for(let i=0;i<10;i++) {
    const [name,lng,lat]=places[i%places.length];
    await page.evaluate(({lng,lat})=>{
      const deck=window.__jbmap!.deck;
      const old=deck.getViewports()[0];
      (deck as unknown as {_onViewStateChange:(p:unknown)=>void})._onViewStateChange({viewId:old.id,interactionState:{},viewState:{longitude:lng,latitude:lat,zoom:16,pitch:45,bearing:0,minZoom:7.5,maxZoom:18,transitionDuration:0}});
    },{lng,lat});
    await expect.poll(()=>page.evaluate(()=>window.__jbmap!.deck.props.layers?.flat().some(l=>l && "id" in l && String(l.id).startsWith("buildings-") && "isLoaded" in l && l.isLoaded)),{timeout:20000}).toBe(true);
    await expect(page.getByText(/일부 건물 정보를 불러오지 못했습니다/)).toHaveCount(0);
    if(i<4) await page.screenshot({path:`test-results/live-${name}.png`});
    snapshots.push(await page.evaluate(()=>{
      const deck=window.__jbmap!.deck;
      const layer=deck.props.layers?.flat().find(l=>l && "id" in l && String(l.id).startsWith("buildings-"));
      const state=(layer as unknown as {state:{tileset:{tiles:unknown[],_cacheByteSize:number}}}).state;
      return {tiles:state.tileset.tiles.length,bytes:state.tileset._cacheByteSize,metrics:(deck as unknown as {metrics:unknown}).metrics};
    }));
  }
  // Real controller movement; rAF is a browser responsiveness metric, not GPU timing.
  const measure = () => page.evaluate(async()=>{
    const deck=window.__jbmap!.deck;
    const view=deck.getViewports()[0] as WebMercatorViewport;
    let frames=0; const start=performance.now();
    await new Promise<void>(resolve=>{
      function frame(now:number) {
        (deck as unknown as {_onViewStateChange:(p:unknown)=>void})._onViewStateChange({viewId:view.id,interactionState:{isDragging:true},viewState:{longitude:view.longitude+Math.sin((now-start)/500)*0.001,latitude:view.latitude,zoom:16,pitch:view.pitch,bearing:0,transitionDuration:0}});
        frames++;if(now-start<2000) requestAnimationFrame(frame);else resolve();
      } requestAnimationFrame(frame);
    });
    const gl=document.querySelector("canvas")?.getContext("webgl2");
    const debug=gl?.getExtension("WEBGL_debug_renderer_info");
    return {fps:frames*1000/(performance.now()-start),renderer:debug && gl?.getParameter(debug.UNMASKED_RENDERER_WEBGL)};
  });
  const frameSample = await measure();
  await page.setViewportSize({width:390,height:844});
  await expect.poll(()=>page.evaluate(()=>(window.__jbmap!.deck.getViewports()[0] as WebMercatorViewport).pitch)).toBe(40);
  await page.screenshot({path:"test-results/live-mobile.png"});
  const mobileFrameSample = await measure();
  await writeFile("test-results/live-building-metrics.json",JSON.stringify({snapshots,frameSample,mobileFrameSample,errors},null,2));
  expect(errors).toEqual([]);
});

test("real buildings preserve school picking and both issue overlays", async ({page}) => {
  test.skip(process.env.LIVE_BUILDINGS !== "1", "Requires real VWorld data");
  test.setTimeout(90000);
  await page.goto("/?scene=city&school=B000005959");
  await expect(page.locator("#school-map")).toHaveAttribute("data-labels-ready","true");
  await expect.poll(()=>page.evaluate(()=>window.__jbmap!.deck.getViewports()[0].zoom)).toBeCloseTo(16,2);
  await expect(page.getByText(/건물 조회:/)).toBeVisible();
  const point = await page.evaluate(()=>{
    const deck=window.__jbmap!.deck;
    const schoolLayer=deck.props.layers?.flat().find(l=>l && "id" in l && l.id==="schools") as unknown as {props:{data:{id:string,lng:number,lat:number}[]}};
    const school=schoolLayer.props.data.find(s=>s.id==="B000005959")!;
    const [x,y]=deck.getViewports()[0].project([school.lng,school.lat,1]);
    const hit=deck.pickObject({x,y,radius:1});
    return {x,y,id:hit?.object?.id,layer:hit?.layer?.id};
  });
  expect(point.id).toBe("B000005959");
  expect(point.layer).toBe("schools");
  const canvas=await page.locator("canvas").boundingBox();
  await page.mouse.click(canvas!.x+point.x,canvas!.y+point.y);
  await expect(page.getByRole("heading",{name:"전주초등학교"})).toBeVisible();
  await page.screenshot({path:"test-results/live-school-picking.png"});
  const response = await page.request.get("/data/schools.json");
  expect(response.ok()).toBe(true);
  const schools = (await response.json()).schools as { id: string; name: string; small: boolean; branch: boolean; lat: number | null; lng: number | null; regionCode: string }[];
  const smallSchool = schools.find(s => s.small && !s.branch && s.lat !== null && s.lng !== null && s.regionCode === "52110");
  expect(smallSchool, "regional default needs a located small main school").toBeDefined();
  for (const issue of ["regional-sustainability","special-education"]) {
    // Keep testing the actual default overlay, but select a school it includes.
    const school = issue === "regional-sustainability" ? smallSchool! : { id: "B000005959", name: "전주초등학교" };
    await page.goto(`/?scene=city&view=issues&issue=${issue}&school=${encodeURIComponent(school.id)}`);
    await expect(page.locator("#school-map")).toHaveAttribute("data-labels-ready","true");
    await expect(page.getByTestId("school-hud")).toContainText(school.name);
    await expect(page.getByText(/건물 조회:/)).toBeVisible({ timeout: 20000 });
    await expect.poll(()=>page.evaluate(()=>{
      const deck=window.__jbmap!.deck as unknown as {layerManager:{getLayers:()=>{id:string,props:{getFillColor?:number[]}}[]}};
      const layers=deck.layerManager.getLayers().filter(l=>l.id.endsWith("-volume"));
      return layers.length>0 && layers.every(l=>l.props.getFillColor?.[3]===76);
    })).toBe(true);
    await page.screenshot({path:`test-results/live-issue-${issue}.png`});
  }
});
