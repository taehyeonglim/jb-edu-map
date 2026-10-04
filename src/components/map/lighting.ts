import { AmbientLight, DirectionalLight, LightingEffect } from "@deck.gl/core";
import type { Material, PreRenderOptions } from "@deck.gl/core";

// Task B — CollisionFilterExtension compatibility fix (region-labels/
// school-labels, labelLayer.ts/schoolLayers.ts). Root-caused end to end
// against the installed sources (@deck.gl/core 9.4.0, @deck.gl/extensions
// 9.4.0) and confirmed empirically; full methodology in task-B-report.md.
// (2026-09-21, Task 2 fix round 1: shadows are now off on BOTH variants, so
// step 1 below no longer triggers for either — the subclass is harmless and
// stays so the collision pass still receives the lighting uniforms and so
// the record below stays with the code; see `lightingEffect`'s comment.)
//
// Symptom: as soon as ANY layer used CollisionFilterExtension (region-labels
// always does, from Task B on), EVERY region-name label vanished completely
// — not "loses some collisions," ALL 14, with the console repeating "luma.gl:
// Binding shadow_uShadowMap0/1 not found in region-labels-{background,
// characters}-cached" (the exact same failure signature Fix round 1's
// picking bug above already diagnosed, just for a different render pass).
//
// Mechanism:
// 1. `this.shadow` (any `_shadow:true` light) makes `LightingEffect.setup()`
//    register "shadow" as a DEFAULT shader module, attached to EVERY layer's
//    compiled program UNCONDITIONALLY (see Fix round 1, finding 4's comment
//    above) — including region-labels' two sub-layers, regardless of their
//    OWN `shadowEnabled:false`. That only stops the shadow value from being
//    SAMPLED, not the `shadow_uShadowMap0/1` uniform BINDINGS from being
//    DECLARED as required by the compiled program.
// 2. `CollisionFilterExtension` auto-registers its own `CollisionFilterEffect`
//    (collision-filter-extension.js's `initializeState`), which renders a
//    SEPARATE pass (`CollisionFilterPass extends _LayersPass`) to populate a
//    per-collisionGroup FBO with each label's picking color, later sampled
//    by the collision shader to decide what's visible. That pass's own
//    `getShaderModuleProps()` (collision-filter-pass.js) hardcodes
//    `{collision:{...}, picking:{...}, lighting:{enabled:false}}` — it says
//    nothing about `shadow` at all.
// 3. `LayersPass._getShaderModuleProps` (layers-pass.js:288-318) would
//    normally still get REAL `shadow_uShadowMap0/1` values from
//    `LightingEffect.getShaderModuleProps()` — but only for effects present
//    in its OWN `effects` list. `CollisionFilterEffect.preRender()`
//    (collision-filter-effect.js) builds that list as
//    `allEffects.filter(e => e.useInPicking && preRenderStats[e.id])`.
//    `LightingEffect.preRender()` (lighting-effect.js) has NO `return`
//    statement on its non-early-exit path — it always implicitly returns
//    `undefined`, even when it just rendered real shadow passes. Deck's own
//    render loop (deck-renderer.js: `opts.preRenderStats[effect.id] =
//    effect.preRender(opts)`) stores that `undefined` verbatim — so
//    `preRenderStats['lighting-effect']` is ALWAYS falsy, and
//    `LightingEffect` is UNCONDITIONALLY excluded from the collision pass's
//    `effects`, regardless of `useInPicking` (already `true` — Fix round 1)
//    or effect ordering (verified NOT the cause: `EffectManager._setEffects`
//    concatenates user effects, incl. `lightingEffect`, BEFORE default
//    effects like `CollisionFilterEffect` — effect-manager.js:86 — so
//    ordering already favors it).
// 4. Without `LightingEffect` in that list, step 3's fallback ("ensure all
//    default shader modules have an entry," layers-pass.js:310-317) inserts
//    an EMPTY `shadow: {}` for the collision pass's draw calls.
//    `shadow.js`'s uniform builder resolves that to `shadow_uShadowMap0/1:
//    undefined` — `WEBGLRenderPipeline._areTexturesRenderable`
//    (webgl-render-pipeline.js:143-152) then logs exactly the observed
//    warning and ABORTS every such draw (`WEBGLRenderPass.draw`,
//    webgl-render-pass.js:166-169) before any rasterization. The collision
//    FBO for `collisionGroup:'labels'` never gets ANY real content drawn
//    into it — so `collision_isVisible` (the installed collision shader
//    module) finds a match for NO label's own picking color anywhere,
//    fading EVERY one of them to alpha 0. `CollisionFilterEffect` itself
//    doesn't warn or throw; this fails completely silently on the visual
//    side.
//
// Confirmed via A/B: `NEXT_PUBLIC_MAP_FX=off` (this file's
// `lightingEffectNoShadow`, `this.shadow` always false so the "shadow"
// module is never attached to any layer at all — step 1 above never
// triggers) makes every region-name chip reappear and the warning vanish
// entirely, with everything else (CollisionFilterExtension, the two-tier
// priority rule, the background chip) unchanged.
//
// Fix: `LightingEffect.preRender()` only needs to return something TRUTHY
// once it has actually run (step 3's consumer only checks truthiness, never
// inspects the value's shape — confirmed against collision-filter-effect.js,
// which only destructures a *different* effect id, `'mask-effect'`, past the
// truthiness check). `shadow`/`dummyShadowMap`/etc. are `private` on
// `LightingEffect` (lighting-effect.d.ts), so an instance-level monkey-patch
// reading them isn't possible from outside the class — this subclass instead
// simply delegates to the real implementation (unchanged behavior) and
// returns `true` itself, satisfying the collision pass's own
// "did this effect run" check without touching deck.gl's package files.
// `instanceof LightingEffect` still holds (EffectManager's own "only add a
// default LightingEffect instance if the user didn't supply one" check,
// effect-manager.js:88, keys on exactly that), so nothing else about how
// deck.gl treats this effect changes.
class CollisionAwareLightingEffect extends LightingEffect {
  override preRender(opts: PreRenderOptions): true {
    super.preRender(opts);
    return true;
  }
}

// 밝은 디오라마 (2026-09-21 spec §3) — daylight from the upper-right
// (north-east) at a high angle. deck.gl's `direction` is the light's TRAVEL
// vector: [-0.5, -1, -2.5] travels west/south/down, so the light arrives from
// east/north/above. A steep angle keeps the lit/unlit wall difference
// gentle (the east and north walls are only partly lit; the west and south
// walls are ambient-only).
const KEY_DIRECTION: [number, number, number] = [-0.5, -1, -2.5];
// Ambient 0.95 (tuning range 0.9~1.05 per spec §3). With REGION_MATERIAL
// below (ambient 0.7), an ambient-only wall lands at 0.7×0.95 ≈ 0.67 of
// the surface color, i.e. ≈0.72× the lit top — the intended miniature
// side-shading, never black (measured on screen ≈0.67× after the contrast
// pass). The single key light below is the only other light (fix round 1,
// finding 4 removed the fill light; see the comment on `lightingEffect`).
const AMBIENT_INTENSITY = 0.95;
// Warm daylight tint on both lights (spec §3): slightly warm white ambient,
// slightly warmer key. Key 0.9 (tuning range 0.9~1.1; Task 2 fix round 1
// screenshot tuning — the ruling's 1.0 put the lightest step at (252,239,242)
// on screen, paper-white, because luma's phong specular (+≈0.04 at this
// shininess) and the post-process brightness/contrast lift the top on top of
// the ≈0.985 the ruling modelled): top face ≈ 0.7×0.95 + 0.3×0.9×cosθ ≈ 0.91
// before specular, which lands the lit top at ≈ the raw palette stop on
// screen — step 1 (232,220,223) now sits visibly below the paper floor.
const AMBIENT_COLOR: [number, number, number] = [255, 250, 240];
const KEY_COLOR: [number, number, number] = [255, 245, 225];
const KEY_INTENSITY = 0.9;

// Created once at module scope (not per-render): deck.gl effects/materials are
// plain config objects, and re-creating them on every DeckMap render would
// needlessly invalidate the layers that reference them.
//
// Fix round 1, finding 4 — the fill DirectionalLight Task A shipped here is
// REMOVED (not just left non-shadow-casting). `LightingEffect` creates one
// ShadowPass PER directional light UNCONDITIONALLY, regardless of that
// light's own `_shadow` flag: confirmed in the installed
// lighting-effect.js — `_createShadowPasses`/`_calculateMatrices` both loop
// over `this.directionalLights` with no per-light filter, and
// `this.shadow` (the effect-wide "is shadowing on at all" switch) is just
// `this.directionalLights.some(light => light.shadow)`. So keeping a
// second, non-shadow-casting fill light was silently paying for a SECOND
// full shadow-map render every frame — and, post-`useInPicking` below,
// every hover pick too (see that comment) — for a light that was never
// meant to cast one; the shadow fragment shader was also sampling
// `shadow_uShadowMap1` and blending its (irrelevant) weight in whenever
// `shadow.lightCount > 1.0` (shadow.js). One light now means one
// ShadowPass, `lightCount === 1`, and `shadow_uShadowMap1` is never
// consulted. The lost fill-light contribution is compensated by raising
// AMBIENT_INTENSITY and REGION_MATERIAL.ambient instead (both since re-tuned
// again for the light theme — see each constant's own comment).
//
// Task 2 fix round 1 ruling (2026-09-21, spec §3) — `_shadow: false`: shadows
// are OFF on both variants. deck.gl 9.4's shadow module judged the entire
// top face of a tall extruded block as self-shadowed (it behaved like a
// global tint — confirmed by pixel modelling), while the cast shadows it was
// meant to add were invisible at the overview zoom. Depth now comes from the
// ambient-only wall shading (see AMBIENT_INTENSITY) and the vignette.
// `shadowColor` is deliberately not assigned (never sampled with no
// shadow-casting light). Everything below that talks about shadow passes
// (`useInPicking`, `CollisionAwareLightingEffect`, findings 1-4) describes
// machinery that only engages when some light has `_shadow: true`; it is
// kept because it is harmless with shadows off and still supplies the
// lighting uniforms to the collision pass (Task B) — and so the historical
// root-cause record stays with the code it explains.
export const lightingEffect = new CollisionAwareLightingEffect({
  ambient: new AmbientLight({ color: AMBIENT_COLOR, intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: KEY_COLOR, intensity: KEY_INTENSITY, direction: KEY_DIRECTION, _shadow: false }),
});

// Task A — 비상 스위치 (`mapFx.ts`'s `isMapFxOff`): historically the SAME lights
// with the key light's `_shadow` off, so DeckMap could swap to a shadow-free
// effect (`NEXT_PUBLIC_MAP_FX=off`) without constructing a new LightingEffect
// on every render — see DeckMap.tsx's `effects` useMemo. Since the Task 2
// fix round 1 ruling turned shadows off on `lightingEffect` too, the two
// variants are configured identically; the separate instance and the
// fx-off swap path are kept so the emergency switch stays structurally
// intact (and so shadows could be re-enabled on one variant only).
// Fix round 1, finding 4 — fill removed here too, though the shadow-pass
// cost argument above does NOT apply to this variant: `this.shadow` is
// false here (no light has `_shadow:true`), so `LightingEffect.setup()`'s
// `if (this.shadow && !this.dummyShadowMap)` guard (lighting-effect.js:41)
// never runs `_createShadowPasses` at all — zero ShadowPass instances exist
// either way, whether this had 1 light or 2. Removed purely so both
// variants share the exact same light SET — at the time the only
// difference was the key light's `_shadow` flag; since Task 2 fix round 1
// there is no difference at all (see above) — so the `NEXT_PUBLIC_MAP_FX=off`
// render stays visually consistent with the default one: not lit by an
// extra light the other variant wouldn't also have.
// Task B — also `CollisionAwareLightingEffect` here, for structural symmetry
// with `lightingEffect` above (both variants are now configured
// identically, so they must behave identically too) — this variant's
// `this.shadow` is false (as is `lightingEffect`'s, since fix round 1), so
// the bug the subclass fixes never actually triggers for either (no
// "shadow" default shader module ever gets attached at all when no light
// has `_shadow:true` — see the very next comment). Both exports remain so
// DeckMap's fx-off swap (`MAP_FX_OFF ? lightingEffectNoShadow :
// lightingEffect`) keeps its shape and shadows could be re-enabled on one
// variant only.
export const lightingEffectNoShadow = new CollisionAwareLightingEffect({
  ambient: new AmbientLight({ color: AMBIENT_COLOR, intensity: AMBIENT_INTENSITY }),
  key: new DirectionalLight({ color: KEY_COLOR, intensity: KEY_INTENSITY, direction: KEY_DIRECTION, _shadow: false }),
});

// Fix round 1, finding 1 — REWRITTEN root-cause comment. Task A's original
// version here (and its regression test) theorized that the shadow
// module's vertex-shader injection was OVERWRITING `gl_Position` with
// uninitialized uniform state during picking. That theory is WRONG —
// re-traced end to end against the exact installed deck.gl/luma.gl sources
// (versions pinned in package.json: @deck.gl/core 9.4.0, @luma.gl/webgl
// 9.4.2) and confirmed empirically (see below). The real mechanism never
// touches `gl_Position` at all; it's a missing-texture-binding pre-flight
// check that silently ABORTS the picking draw call before any GPU
// rasterization happens:
//
// 1. Once `_shadow: true` makes `this.shadow` true, `LightingEffect.setup()`
//    calls `deck._addDefaultShaderModule(shadow)` (lighting-effect.js:
//    41-48). `Layer.getShaders()` unconditionally merges
//    `context.defaultShaderModules` into EVERY layer's shader (layer.js:
//    324-328) — so from this point on, every layer's compiled program, in
//    every pass (including its picking-pass variant), declares
//    `uniform sampler2D shadow_uShadowMap0/1` (shadow.js:56-57), whether or
//    not that layer actually uses lighting.
// 2. The picking pass filters effects to `effects?.filter(e =>
//    e.useInPicking)` (pick-layers-pass.js:48). `LightingEffect` never sets
//    `useInPicking` (absent from the whole installed lighting-effect.js) —
//    so `LightingEffect.getShaderModuleProps` (lighting-effect.js:100-122,
//    the ONLY source of a real `dummyShadowMap`/`shadowMaps`) never runs
//    for that pass, without the fix below.
// 3. `LayersPass._getShaderModuleProps`'s "ensure every default shader
//    module has an entry so its getUniforms is called" fallback
//    (layers-pass.js:310-318) still inserts an EMPTY `shadow: {}` (that
//    fallback exists for a different reason — terrain/mask passes, per its
//    own comment — and has no idea this module needed real values here).
//    `shadow.js`'s `createShadowUniforms({})` (shadow.js:147-156) hits its
//    early-return branch (`!projectProps`) and returns `{drawShadowMap:
//    false, useShadowMap: false, shadow_uShadowMap0: undefined,
//    shadow_uShadowMap1: undefined}`. Because `drawShadowMap`/
//    `useShadowMap` are BOTH false, the vertex shader's
//    `shadow_setVertexPosition` (shadow.js:28-48) falls through both `if`s
//    and returns `gl_Position` COMPLETELY UNCHANGED — no corruption. This
//    is exactly where the old theory breaks down.
// 4. What actually breaks: `shadow_uShadowMap0`/`shadow_uShadowMap1` are
//    real texture bindings the compiled picking-pass program now requires
//    (step 1), bound to `undefined` (step 3).
//    `WEBGLRenderPipeline._areTexturesRenderable` (webgl-render-pipeline.js:
//    143-152) checks every declared binding has a value before each draw;
//    a missing one logs exactly the observed console message (`Binding
//    shadow_uShadowMap0 not found in ...`, same file:147) and returns
//    false. `WEBGLRenderPass.draw()` (webgl-render-pass.js:166-169) then
//    does `if (!pipeline._areTexturesRenderable(...)) { ...; return false;
//    }` — the draw is ABORTED before `gl.drawArrays`/`gl.drawElements` is
//    ever called, for every layer, on every picking draw. That's why the
//    picking buffer came back completely EMPTY (0/86 hits on a full-canvas
//    grid scan — see task-A-report.md — not corrupted/glitched hits): no
//    geometry was ever rasterized into it at all.
//
// Verified two ways: (a) reading the installed sources end to end as above;
// (b) empirically, by temporarily commenting out the two `useInPicking =
// true` lines below and re-running a live pick + console-warning trace —
// reproduced (fix disabled) 0/10 `deck.pickObject()` hits (each aborted
// draw returning in ~1ms) plus the exact predicted `shadow_uShadowMap0/1 not found in
// regions-polygons-fill-{top,side}-cached` / `region-islands-polygons-
// {fill-top,stroke}-cached` warnings, with a stack trace through
// `WEBGLRenderPipeline._areTexturesRenderable` -> `WEBGLRenderPass.draw` ->
// `Model.draw` matching this trace exactly. Re-enabling the two lines
// restored 10/10 hits at ~25-30ms/pick (see the performance-cost comment
// just below) — full methodology in task-A-report.md's "Fix round 1"
// section. `Effect.useInPicking` is a plain, optional interface field
// (`@deck.gl/core`'s effect.d.ts) — `LightingEffect`'s own concrete class
// just never declares/sets it, hence the cast. Applied to BOTH variants for
// symmetry, though it's a no-op for `lightingEffectNoShadow` (shadow's
// default shader module is never registered at all when `this.shadow` is
// false, so nothing depends on this flag there).
// 2026-09-22 성능 조정: `useInPicking` is no longer set. It was Task A's fix for a
// deck.gl 9.4 picking regression caused by the SHADOW module's unbound shadow
// maps in the picking pass; with `_shadow: false` on both variants the shadow
// module is never installed, so the lighting effect can stay out of the
// picking AND collision passes (one fewer lighting evaluation per hover pick;
// verified on a production build that every label chip still renders once
// `data-labels-ready` fires — CollisionFilterExtension does not need it).

// Fix round 1, finding 3 — performance cost of the fix above, MEASURED (not
// just estimated). (2026-09-21, Task 2 fix round 1: with `_shadow: false` on
// both variants no ShadowPass exists, so the per-pick cost described below
// is now nil — `preRender` only does its matrix math. Kept as the record of
// what re-enabling shadows would cost.)
// `DeckPicker._drawAndSample`/`_drawAndSampleAsync` — used
// by every `pickObject` call, including deck.gl's own hover picking —
// do `for (const effect of effects) if (effect.useInPicking)
// effect.preRender(opts)` before the actual picking draw
// (deck-picker.js:562-566 / 644-648). `useInPicking = true` means
// `LightingEffect.preRender` (lighting-effect.js:77-99) now runs on EVERY
// pick: a full re-render of the shadow pass — every shadow-casting layer
// (everything except region-labels/school-labels/region-top-rings, which
// opt out via `shadowEnabled: false`), i.e. up to 14 시군 region fill
// polygons plus up to 149 school ColumnLayer instances in the largest
// selected region (public/data/regions.geojson has 14 features;
// public/data/schools.json's largest region has 149 rows). Measured
// directly against this app (Chromium, `window.__jbmap.deck.pickObject()`
// x10, timed with `performance.now()`): ~23-33ms per pick with this fix
// active (shadow pass re-rendered) vs. ~1-2ms per pick with it disabled
// (draw aborted immediately per finding 1 above, and picking doesn't work
// at all) — so the fix costs on the order of 25ms of extra GPU/CPU work per
// pick. Accepted because: (a) there is no correct alternative — finding 1
// showed picking is completely broken without it; (b) hover picking is
// already throttled to at most once per animation frame by deck.gl itself,
// not once per raw `pointermove` event (`@deck.gl/core`'s deck.js:151-153:
// "the pointermove event may fire multiple times in between two animation
// frames... we save the last pick request and only do it once on the next
// animation frame"); (c) removing the fill light (finding 4, below/above)
// already halved this cost from Task A's original 2-shadow-pass setup to
// exactly 1.

// Fix round 1, finding 2 — the "luma.gl: Binding shadow_uShadowMap0/1 not
// found in ..." warning Task A's report said still appeared after the fix
// above: investigated with a temporary console.warn-wrapping Playwright
// script (not committed — full methodology and numbers in
// task-A-report.md's "Fix round 1" section). Verdict: WARM-UP ONLY, and in
// fact NOT REPRODUCIBLE AT ALL against this exact code in a clean session —
// across 2 fresh page loads (mount, 3s idle, a 24-point hover sweep, 10
// explicit `pickObject()` calls, a real region click, another 3s idle),
// zero such warnings fired and all 10 picks hit correctly. Two things make
// it structurally incapable of being a per-frame/growing cost even when it
// DOES fire: (a) it can only fire from the exact same
// `_areTexturesRenderable` abort path as finding 1 above — i.e. it would
// mean some OTHER pipeline is still hitting the finding-1 bug, not a
// separate mechanism; (b) `@probe.gl/log`'s `Log.warn()` de-duplicates with
// `once: true` (base-log.js:58-70), keyed on the fully formatted message
// string (which includes the pipeline id) via an in-memory `Set` scoped to
// the page's JS realm — so each distinct (binding, pipeline-id) pair can
// log to the console AT MOST ONCE per page load, never repeatedly.
// (Confirmed empirically: temporarily disabling `useInPicking` above and
// hover-sweeping produced exactly 8 warnings — 2 bindings x 4 pipelines —
// with zero further growth across 10 more explicit picks and a region
// click that re-exercised those same pipelines.) Best-supported reading of
// what the implementer actually saw (their own words, task-A-report.md's
// 검증 section: "여러 초 대기 + 카메라 nudge 후에도 지속되긴 하지만"/"persists even
// after waiting several seconds + a camera nudge"): that description is
// EXACTLY what a one-time, early-session occurrence looks like from the
// outside — logged once (if timing/driver happens to hit the narrow window
// before every pipeline/the dummy shadow texture is fully warm), then
// permanently stuck in the console SCROLLBACK afterward (nothing makes an
// already-printed line disappear); a recheck "several seconds later" can't
// tell that apart from an ongoing problem without specifically checking
// whether NEW lines keep appearing, which the once-cache above says they
// structurally can't. Not confirmed further (out of this finding's scope):
// a GPU/driver difference (their manual browser check vs. this
// investigation's Playwright/headless Chromium) or a Turbopack-HMR-stale
// pipeline from mid-edit dev iteration are both plausible secondary
// explanations for why it fired at all in their session but not in either
// of mine.

// 밝은 디오라마 (spec §3, Task 2 fix round 1 ruling + screenshot tuning) —
// matte, paper-like blocks, exposure set for luma.gl's phong model with
// shadows off (material ambient 0.7, tuning range 0.7~0.8; see
// KEY_INTENSITY for why the low end):
//   lit top    ≈ ambient·A + diffuse·K·cosθ = 0.7×0.95 + 0.3×0.9×0.91 ≈ 0.91
//   unlit wall ≈ ambient·A                 = 0.7×0.95             ≈ 0.67
// (+ a broad, faint specular ≈0.04 on the top at shininess 8) so the top
// never clips and a wall facing away from the key reads ≈0.72× the top.
// Low shininess so pastel faces don't get a plastic highlight.
// `specularColor` is on luma.gl 9.4's 0..255 BYTE scale — the phong shader
// applies `floatColors_normalize(material.specularColor)` (= /255) and its
// own default is [38.25, 38.25, 38.25] — so [20, 20, 20] ≈ 0.08. Shared by
// the region bodies and the school columns.
export const REGION_MATERIAL: Material = {
  ambient: 0.7,
  diffuse: 0.3,
  shininess: 8,
  specularColor: [20, 20, 20],
};
