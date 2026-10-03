import { defineConfig, devices } from "@playwright/test";

// Orchestrator (3D improvement, Task D/E parallel runs) — the dev/prod server
// port defaults to 3000 but can be moved with PW_PORT so two worktrees can run
// e2e at the same time without one silently reusing the other's server
// (`reuseExistingServer` below). Everything port-related derives from this.
const PORT = Number(process.env.PW_PORT ?? 3000);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "e2e",
  // External checks are opt-in and run separately from deterministic CI.
  testIgnore: [
    ...(!process.env.DEPLOYMENT_URL ? ["**/deployed-*.spec.ts"] : []),
    ...(process.env.LIVE_BUILDINGS !== "1" ? ["**/city-buildings-live.spec.ts"] : []),
  ],
  // Task 6, Section D.1 — CI's own "실패 시 playwright-report/ 아티팩트
  // 업로드" step needs an actual playwright-report/ directory to exist,
  // which neither of Playwright's own DEFAULT reporters ('list' locally,
  // 'dot' on CI — chosen automatically from process.env.CI when `reporter`
  // isn't set at all) ever write to disk; `html`/`github` are both built
  // into @playwright/test itself (no new dependency). `open: "never"` stops
  // the html reporter from trying to launch a browser tab after a headless
  // CI run. Locally, keep the plain interactive `list` reporter.
  reporter: process.env.CI ? [["html", { open: "never" }], ["github"]] : "list",
  // Fix round 1/5, finding 2 — Playwright's own default `retries` is 0
  // everywhere (local AND CI; there is no built-in CI-aware default, despite
  // task-6-report.md's "우려 사항" section claiming otherwise — corrected
  // here rather than repeated). 2 retries on CI absorbs known-flaky e2e
  // timing (e.g. select-region.spec.ts's canvas-click test — see its own
  // in-file comment for the documented cause: mjolnir.js gesture recognition
  // occasionally missed under CPU contention from parallel workers, not a
  // real regression). 0 locally: a real local failure should surface
  // immediately, not be silently retried away.
  //
  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — `workers`
  // dropped from 2 to 1 on CI: run 35541524874 showed the 2-worker
  // contention is worse than just the documented canvas-click flake. The
  // canvas-click test's own in-app diagnostic (DeckMap.tsx's
  // window.__jbmap.events) came back completely EMPTY across every retry —
  // deck.gl's onClick never fired at all, not merely picked the wrong
  // target — and a SEPARATE, previously-stable test (RegionList click's
  // camera-pitch assertion) failed in the very same run with an
  // almost-but-not-quite-55 pitch, i.e. its FlyTo transition was still
  // mid-flight 2s in. Both point at the same shared-2-vCPU-runner
  // contention between the two parallel workers, not at either test's own
  // logic. ubuntu-latest's swiftshader software GL (see the chromium
  // project's launchOptions below) already makes every frame more
  // expensive than on a real GPU; running two such Chromium instances at
  // once leaves too little headroom. Serial execution costs wall-clock time
  // (21 tests one at a time vs. 2-wide) but this repo's suite is small
  // enough that the trade is worth it for determinism.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  // Per-test budget. On the swiftshader CI runner the fixed costs alone
  // (context creation up to ~8-10 s on a warm worker, ~4.5 s to map-ready,
  // ~2 s per frame-bound action) approach Playwright's 30 s default —
  // trace analysis of run 35578948946 showed every attempt dying on the
  // TEST timeout, not on an expect. Diagnostic screenshots are skipped on
  // CI (e2e/fixtures.ts docShot); this is the belt-and-braces half.
  timeout: process.env.CI ? 90_000 : 30_000,
  // CI fix (run 35570411276) — default expect() timeout, longer on CI's slow
  // software-GL runner; only the WAIT grows, not what's asserted.
  expect: { timeout: process.env.CI ? 15_000 : 5_000 },
  use: {
    baseURL: BASE_URL,
    // CI (software-GL runner): emulate prefers-reduced-motion so the app's own
    // reduced-motion path (useCamera/useReducedMotion → transitionDuration 0,
    // layers' `transitions` omitted) makes camera fly-to and layer morphs
    // instant — saves the 2-3 s pitch poll and the per-frame collision FBO
    // re-render on that runner. (Earlier revisions of this comment blamed a
    // delayed React commit for the select-region flake; the traces showed
    // it was the 30 s test budget — see `timeout` above.) Locally unchanged.
    reducedMotion: process.env.CI ? "reduce" : undefined,
    // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — no added
    // dependency (both reporters are built into @playwright/test); gives the
    // uploaded playwright-report/ artifact an actual trace + screenshot for
    // any future failure, instead of only the error-context.md snapshot.
    // 'only-on-failure'/'retain-on-failure' both already skip passing tests,
    // so this doesn't bloat the artifact on a green run. Local runs are
    // unaffected (default 'off').
    // "on-first-retry": the first attempt runs without trace recording
    // (context teardown measured ~5 s per test with tracing on), retries
    // still record so a persistent failure ships a trace.
    trace: process.env.CI ? "on-first-retry" : undefined,
    screenshot: process.env.CI ? "only-on-failure" : undefined,
  },
  webServer: {
    // CI runs the production build (matches what actually ships; also
    // avoids a cold Turbopack dev-server compile racing the test timeout —
    // see `timeout` below) via `npm run build && npm run start`; local runs
    // keep using `next dev` for fast iteration. Task 6, Section E
    // (orchestrator ruling): this supersedes Section D.1's literal
    // "`npm run build && npm run start &` then `CI=1 npm run e2e`" — using
    // Playwright's own `webServer` for both local and CI keeps exactly one
    // server-lifecycle mechanism instead of two.
    command: process.env.CI ? `npm run build && npm run start -- -p ${PORT}` : `npm run dev -- -p ${PORT}`,
    url: BASE_URL,
    // Task C — if a dev server started WITHOUT NEXT_PUBLIC_VWORLD_KEY set
    // (e.g. a stale `npm run dev` left running from before this env var
    // existed, or one started by hand) is reused here instead of a fresh
    // one, the 배경 지도 segmented control/layer never appear (see
    // DeckMap.tsx's `VWORLD_KEY` gate) and e2e/basemap.spec.ts fails
    // outright — restart your local dev server if this happens.
    reuseExistingServer: !process.env.CI,
    // 120s (up from Playwright's 60s default): `next dev`'s first Turbopack
    // compile of this page (deck.gl + widgets + the whole indicator
    // registry) can exceed 60s cold, especially under CI/shared-runner CPU
    // contention — see task-6-brief.md, Section E.
    timeout: 120_000,
    // NEXT_PUBLIC_* vars are inlined into the client bundle at compile time,
    // so this only takes effect for a server Next itself starts/compiles —
    // see DeckMap.tsx's window.__jbmap bridge (e2e/select-region.spec.ts's
    // canvas-click coverage). package.json must not be modified (task
    // brief), so this is set here rather than via an npm script.
    //
    // NEXT_PUBLIC_VWORLD_KEY (Task C) — an arbitrary non-empty placeholder,
    // NOT the real `.env.local` key: e2e never calls the real VWorld API at
    // all (e2e/fixtures.ts routes every `api.vworld.kr` request to a stubbed
    // 1x1 PNG), it only needs a truthy value so DeckMap's `VWORLD_KEY` gate
    // renders the "배경 지도" segmented control (끄기 · 위성 · 일반, default
    // 위성) and constructs the TileLayer.
    env: { NEXT_PUBLIC_E2E: "1", NEXT_PUBLIC_VWORLD_KEY: process.env.LIVE_BUILDINGS === "1" ? process.env.NEXT_PUBLIC_VWORLD_KEY ?? "" : "e2e-test" },
  },
  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1600, height: 900 },
        deviceScaleFactor: 1,
        // Fix round 2, finding 6 — these swiftshader/ANGLE flags force
        // software GL rendering for headless Chromium on a GPU-less CI
        // runner (GitHub Actions' ubuntu-latest). They're Linux-specific:
        // applying them unconditionally under `CI=1` would also fire during
        // a LOCAL `CI=1 npm run e2e` run on macOS/Windows, where they can
        // break WebGL2 rendering instead of fixing it (there's no swiftshader
        // ANGLE backend to select there). Gated on `process.platform ===
        // "linux"` in addition to `process.env.CI` so a local `CI=1` run
        // still exercises the CI webServer/retries/workers config (Section
        // E's orchestrator ruling) without also inheriting a Linux-only
        // workaround that doesn't apply on this machine.
        ...(process.env.CI && process.platform === "linux"
          ? {
              launchOptions: {
                args: ["--use-gl=angle", "--use-angle=swiftshader", "--ignore-gpu-blocklist"],
              },
            }
          : {}),
      },
    },
  ],
});
