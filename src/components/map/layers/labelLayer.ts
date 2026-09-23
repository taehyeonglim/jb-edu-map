import { TextLayer } from "@deck.gl/layers";
import {
  CollisionFilterExtension,
  type CollisionFilterExtensionProps,
} from "@deck.gl/extensions";

// Task B — module-scope constant (same pattern as regionLayers.ts's
// `REGION_MATERIAL`/lighting.ts's `lightingEffect`): a fresh
// `new CollisionFilterExtension()` on every render would be equally safe —
// `LayerExtension.equals()` (installed @deck.gl/core's layer-extension.js)
// compares `this.constructor === extension.constructor && deepEqual(opts)`,
// and this extension is always constructed with no `opts` — but a single
// shared instance avoids the pointless per-render allocation.
const COLLISION_FILTER_EXTENSION = new CollisionFilterExtension();

export interface RegionLabel {
  code: string;
  name: string;
  /**
   * Task 6, Section C.2 / Task B fix round 1 — for 전주·익산·완주·김제, this is
   * already nudged away from the polygon's raw geometric center
   * (`build-regions.ts`'s `labelOffsetToLngLat`, applied to
   * `regions.geojson`'s `labelPoint` at build time). No render-time pixel
   * offset is applied on top of it (see `makeRegionLabelLayer`'s own
   * comment for why: `getPixelOffset` used to do this and broke
   * CollisionFilterExtension's visibility sampling for those 2 regions).
   */
  position: [number, number];
}

export interface RegionLabelLayerOptions {
  collisionEnabled?: boolean;
  /** Same injection point as `makeRegionsLayer`'s `elevationOf`, so labels float just above their region's top face. */
  elevationOf: (code: string) => number;
  textOf: (code: string) => string;
  triggerKey: string | number;
  /** Must be a family `document.fonts.check()` has confirmed is ready — see DeckMap's font-gating (`fontReady`). */
  fontFamily: string;
  /** Static charset from public/data/charset.json — keeps the SDF atlas stable across selection changes. */
  characterSet: string[];
  /**
   * Task B — the currently-selected 시군 code, or null/omitted. The selected
   * region's label always wins a collision (priority 1000 — see
   * `getCollisionPriority` below), and it's included in
   * `updateTriggers.getCollisionPriority` (alongside `triggerKey`) so a
   * selection change re-evaluates priority right away, the same
   * optional-defaults-to-null pattern as `RegionsLayerOptions.selectedCode`
   * (regionLayers.ts).
   */
  selectedCode?: string | null;
  /**
   * Task B — collision priority for a NON-selected region's label (bigger
   * indicator value -> higher priority; a region with no data -> the lowest
   * priority of all) — see CollisionFilterExtension's own docs (installed
   * @deck.gl/extensions' collision-filter-extension.d.ts): "Must return a
   * number in the range -1000 -> 1000. Features with higher values are
   * shown preferentially." DeckMap.tsx computes this from `rank()`
   * (src/lib/stats.ts). Defaults to a constant 0 (every non-selected label
   * ties) when omitted, for callers that don't care about ranked priority.
   */
  priorityOf?: (code: string) => number;
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** Fixed-size region labels anchored to the map. */
export function makeRegionLabelLayer(
  labels: RegionLabel[],
  opts: RegionLabelLayerOptions,
) {
  const transitionDuration = opts.transitionDuration ?? 600;
  const selectedCode = opts.selectedCode ?? null;
  const priorityOf = opts.priorityOf ?? (() => 0);

  return new TextLayer<RegionLabel, CollisionFilterExtensionProps<RegionLabel>>(
    {
      id: "region-labels",
      data: labels,
      // Anchor to ground; labels stay on the flat map.
      getPosition: (d): [number, number, number] => [
        d.position[0],
        d.position[1],
        opts.elevationOf(d.code),
      ],
      getText: (d) => opts.textOf(d.code),
      // Task B, fix round 1 — 라벨 겹침 완화 (전주·익산·완주·김제)의 넛지는 더 이상
      // 여기서 렌더 타임 `getPixelOffset`으로 적용하지 않는다: `d.position`(=
      // regions.geojson의 labelPoint) 자체가 이미 build-regions.ts에서 지리적으로
      // 옮겨져 있다. 이유 — CollisionFilterExtension의 충돌 가시성 샘플(설치된
      // @deck.gl/extensions의 shader-module.js)은 `geometry.worldPosition`(=
      // `getPosition`이 반환한 값 그대로, pixelOffset 미반영)을 직접 재투영해서
      // 샘플 좌표를 만든다 — `getPixelOffset`으로 텍스트만 화면 공간에서 앵커로부터
      // 멀리 밀어내면, 그 라벨은 자기 자신의 그려진 위치를 그 샘플 지점에서 찾지
      // 못해 `getCollisionPriority`가 아무리 높아도(선택 시 1000) 계속 안 보이는
      // 문제가 실제로 있었다(전주시·익산시 — task-B-report.md "Fix round 1" 참고).
      // 앵커 자체를 옮기면 두 지점이 항상 같아서 이 문제가 구조적으로 사라진다.
      sizeUnits: "pixels",
      getSize: 14,
      sizeMinPixels: 14,
      sizeMaxPixels: 14,
      billboard: true,
      getAlignmentBaseline: "bottom",
      fontFamily: opts.fontFamily,
      fontWeight: 600,
      characterSet: opts.characterSet,
      // Task B — 라벨 칩: `buffer: 8` (up from the SDF default) gives each
      // glyph enough padding in the atlas for the wider 0.25 outline (up from
      // 0.15) plus the background chip below to not clip a glyph's edge.
      fontSettings: { sdf: true, fontSize: 48, buffer: 8 },
      // 밝은 디오라마 (spec §5) — 흰 칩 + 진한 글자: ink text with a white outline
      // on a near-opaque white chip (the dark theme's colors inverted; padding,
      // radius, SDF and collision settings unchanged).
      outlineWidth: 0.25,
      outlineColor: [18, 36, 56, 255],
      getColor: [235, 245, 252, 255],
      // Task B — 라벨 칩: a near-opaque background chip behind each label so it
      // stays readable over the VWorld basemap tiles (Task C) and busy
      // top-face colors alike, not just its outline. Renders via TextLayer's
      // own `background` sub-layer (TextBackgroundLayer) —
      // `_subLayerProps.background` below still excludes it from shadow
      // casting.
      background: true,
      getBackgroundColor: [18, 36, 56, 235],
      backgroundPadding: [6, 3],
      backgroundBorderRadius: 6,
      // Task B — CollisionFilterExtension: hides an overlapping label instead
      // of letting two region names stack illegibly. `sizeScale: 1.3` tests
      // collision against a slightly larger-than-drawn hitbox (a bit of
      // breathing room between adjacent labels, not just literal pixel
      // overlap). `getCollisionPriority` — installed
      // @deck.gl/extensions' collision-filter-extension.d.ts: "Features with
      // higher values are shown preferentially" (range -1000 -> 1000) — the
      // SELECTED region's label always wins outright (1000, the extension's
      // own documented max); every other label falls back to `priorityOf`
      // (DeckMap.tsx: reversed value rank, null -> lowest).
      extensions: [
        ...(opts.collisionEnabled === false
          ? []
          : [COLLISION_FILTER_EXTENSION]),
      ],
      collisionEnabled: opts.collisionEnabled ?? true,
      collisionGroup: "labels",
      collisionTestProps: { sizeScale: 1.3 },
      getCollisionPriority: (d: RegionLabel) =>
        d.code === selectedCode ? 1000 : priorityOf(d.code),
      // 추가 요구 #2: labels must always draw on top of a taller neighboring
      // region's already-rendered top face, never get depth-tested away behind
      // it. `depthCompare: 'always'` makes every fragment pass the depth test
      // unconditionally (`depthWriteEnabled: false` alone only stops the label
      // from *writing* depth — it would still be *tested* against and hidden).
      // CompositeLayer.getSubLayerProps forwards `parameters` verbatim to
      // every sub-layer TextLayer renders, so setting it here once is enough.
      // Task B — this `depthCompare: 'always'` does NOT leak into the
      // collision pass and invalidate `getCollisionPriority` above: confirmed
      // against the installed @deck.gl/extensions'
      // collision-filter-pass.js — its `getLayerParameters` unconditionally
      // returns `{...layer.props.parameters, depthWriteEnabled: true,
      // depthCompare: 'less-equal'}`, i.e. it OVERWRITES depthCompare with
      // 'less-equal' for every layer it renders into the collision FBO,
      // regardless of what the layer's own `parameters` says (same pattern as
      // shadow-pass.js). No `collisionTestProps.parameters` override needed —
      // see task-B-report.md.
      parameters: { depthCompare: "always", depthWriteEnabled: false },
      // Task A — 그림자 캐스팅 제외: `shadowEnabled` on the OUTER TextLayer never
      // reaches its leaf sub-layers (MultiIconLayer for `characters`,
      // TextBackgroundLayer for `background`) — deck.gl's shadow pass reads
      // `layer.props.shadowEnabled` off whichever leaf actually draws, and a
      // CompositeLayer only forwards a fixed prop allowlist (parameters,
      // opacity, ...) to `getSubLayerProps`, not arbitrary props. `_subLayerProps`
      // is the documented per-sublayer override hook for exactly this.
      _subLayerProps: {
        characters: { shadowEnabled: false },
        background: { shadowEnabled: false },
      },
      updateTriggers: {
        getPosition: [opts.triggerKey, selectedCode],
        getText: [opts.triggerKey],
        getCollisionPriority: [opts.triggerKey, selectedCode],
      },
      // `transitions` is OMITTED (undefined) when the duration is 0: deck.gl's
      // CollisionFilterEffect re-renders its collision FBO every frame while any
      // layer has a truthy `transitions` object (collision-filter-effect.js
      // `needsRender`), even for a 0ms transition. Under reduced motion / CI
      // that was pure per-frame waste.
      transitions:
        transitionDuration > 0
          ? { getPosition: transitionDuration }
          : undefined,
    },
  );
}
