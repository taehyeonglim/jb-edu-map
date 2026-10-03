import { chromium } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";

// Use a locally running server with NEXT_PUBLIC_E2E=1. External tiles are
// deterministic fixtures; this measures UI readiness, not VWorld latency/FPS.
const url = process.env.MEASURE_URL ?? "http://localhost:3100";
const output = process.env.MEASURE_OUTPUT ?? "test-results/performance.json";
const browser = await chromium.launch();
const runs = [];
try {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    for (let run = 1; run <= 3; run++) {
      const context = await browser.newContext({
        viewport,
        reducedMotion: "reduce",
      });
      const page = await context.newPage();
      let buildingRequests = 0;
      await page.route("**/api.vworld.kr/**", (route) =>
        route.fulfill({
          contentType: "image/png",
          body: Buffer.from(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
            "base64",
          ),
        }),
      );
      await page.route("**/api/buildings/**", (route) => {
        buildingRequests++;
        return route.fulfill({
          json: {
            type: "FeatureCollection",
            features: [
              {
                type: "Feature",
                id: "measurement-building",
                properties: { displayHeight: 18, heightSource: "provided" },
                geometry: {
                  type: "Polygon",
                  coordinates: [
                    [
                      [127.147, 35.823],
                      [127.148, 35.823],
                      [127.148, 35.824],
                      [127.147, 35.824],
                      [127.147, 35.823],
                    ],
                  ],
                },
              },
            ],
            metadata: { complete: true, source: "fixture" },
          },
        });
      });
      const start = performance.now();
      await page.goto(url);
      await page
        .locator('#school-map[data-map-ready="true"]')
        .waitFor({ timeout: 60000 });
      const mapReadyMs = performance.now() - start;
      await page
        .getByRole("button", { name: "학교·통계", exact: true })
        .click();
      const searchStart = performance.now();
      await page
        .getByRole("searchbox", { name: "학교명 검색" })
        .fill("전주초등학교");
      await page
        .locator('[data-testid="school-result-count"]')
        .filter({ hasText: "검색 결과 1개" })
        .waitFor();
      const searchMs = performance.now() - searchStart;
      await page
        .getByRole("button", { name: "패널 닫기", exact: true })
        .click();
      const switchStart = performance.now();
      if (viewport.width < 1024) {
        await page.getByRole("button", { name: /전체 지표/ }).click();
        await page.getByRole("radio", { name: /^교원수/ }).click();
      } else {
        await page
          .getByRole("navigation", { name: "전체 지도 지표" })
          .getByRole("button", { name: "교원수", exact: true })
          .click();
      }
      await page.waitForFunction(
        () =>
          new URL(location.href).searchParams.get("indicator") ===
          "teachers_total",
      );
      const indicatorMs = performance.now() - switchStart;
      const buildingStart = performance.now();
      await page.evaluate(() => {
        const deck = window.__jbmap.deck;
        const old = deck.getViewports()[0];
        deck._onViewStateChange({
          viewId: old.id,
          interactionState: {},
          viewState: {
            longitude: 127.148,
            latitude: 35.824,
            zoom: 16,
            pitch: old.pitch,
            bearing: 0,
            minZoom: 7.5,
            maxZoom: 18,
            transitionDuration: 0,
          },
        });
      });
      await page.waitForFunction(() =>
        performance
          .getEntriesByType("resource")
          .some((r) => r.name.includes("/api/buildings/")),
      );
      const buildingRequestMs = performance.now() - buildingStart;
      await page.waitForFunction(() =>
        window.__jbmap.deck.props.layers
          .flat()
          .some(
            (layer) => layer?.id.startsWith("buildings-") && layer.isLoaded,
          ),
      );
      // Observe a rendered frame with loaded geometry, preserving the app's callback.
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            const deck = window.__jbmap.deck;
            const original = deck.props.onAfterRender;
            deck.setProps({
              onAfterRender: (...args) => {
                deck.setProps({ onAfterRender: original });
                original?.(...args);
                resolve();
              },
            });
            deck.redraw("measurement");
          }),
      );
      const buildingReadyMs = performance.now() - buildingStart;
      const resources = await page.evaluate(() =>
        performance
          .getEntriesByType("resource")
          .filter((r) => r.name.includes("/data/"))
          .map((r) => ({
            path: new URL(r.name).pathname,
            bytes: r.decodedBodySize,
            duration: Math.round(r.duration),
          })),
      );
      const renderer = await page.evaluate(() => {
        const gl = document
          .querySelector("#school-map canvas")
          ?.getContext("webgl2");
        const ext = gl?.getExtension("WEBGL_debug_renderer_info");
        return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : "unknown";
      });
      runs.push({
        viewport,
        run,
        mapReadyMs: Math.round(mapReadyMs),
        searchMs: Math.round(searchMs),
        indicatorMs: Math.round(indicatorMs),
        buildingRequestMs: Math.round(buildingRequestMs),
        buildingReadyMs: Math.round(buildingReadyMs),
        buildingRequests,
        dataRequests: resources.length,
        dataBytes: resources.reduce((sum, r) => sum + r.bytes, 0),
        renderer,
      });
      await context.close();
    }
  }
  await mkdir(dirname(output), { recursive: true });
  await writeFile(
    output,
    JSON.stringify(
      {
        measuredAt: new Date().toISOString(),
        node: process.version,
        browser: browser.version(),
        url,
        note: "3 fresh browser contexts per viewport; local server; reduced motion; external tile fixtures; first run can include cold compilation.",
        runs,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(JSON.stringify({ output, runs }));
} finally {
  await browser.close();
}
