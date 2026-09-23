import { describe, expect, it, vi } from "vitest";
import type { Position } from "@deck.gl/core";
import { CollisionFilterExtension } from "@deck.gl/extensions";

import { makeRegionLabelLayer, type RegionLabel } from "@/components/map/layers/labelLayer";

const labels: RegionLabel[] = [
  { code: "52110", name: "전주시", position: [127.1, 35.8] },
  { code: "52130", name: "군산시", position: [126.7, 35.9] },
];

describe("makeRegionLabelLayer", () => {
  it("is a billboard text layer with the given fontFamily/characterSet", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a", "b"],
    });
    expect(layer.props.id).toBe("region-labels");
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.fontFamily).toBe("Test Font");
    expect(layer.props.characterSet).toEqual(["a", "b"]);
    expect(layer.props.fontWeight).toBe(600);
    expect(layer.props.getAlignmentBaseline).toBe("bottom");
    // Task B — 라벨 칩: buffer 8 gives the SDF atlas enough padding around
    // each glyph for the (now larger, 0.25) outline plus the background's
    // own padding to not clip; see the background-chip block below.
    expect(layer.props.fontSettings).toEqual({ sdf: true, fontSize: 48, buffer: 8 });
    expect(layer.props.outlineWidth).toBe(0.25);
  });

  // Task B — 라벨 칩: an opaque-ish chip behind each label (readable over the
  // VWorld basemap tiles, Task C — see task-B-brief.md section 1), rendered
  // by TextLayer's own `background` sub-layer (TextBackgroundLayer) —
  // confirmed against the installed @deck.gl/layers' text-layer.js:
  // `background && new BackgroundLayerClass(...)` only renders that
  // sub-layer at all when `background: true`. 밝은 디오라마 (spec §5): white
  // chip, ink text, white outline — the dark chip's colors inverted, with
  // the chip's structure (padding/radius/SDF) unchanged.
  it("renders a white background chip with ink text behind each label", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.background).toBe(true);
    expect(layer.props.getBackgroundColor).toEqual([18, 36, 56, 235]);
    expect(layer.props.getColor).toEqual([235, 245, 252, 255]);
    expect(layer.props.outlineColor).toEqual([18, 36, 56, 255]);
    expect(layer.props.backgroundPadding).toEqual([6, 3]);
    expect(layer.props.backgroundBorderRadius).toBe(6);
  });

  it("getPosition appends elevationOf(code) as the z coordinate", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
    const layer = makeRegionLabelLayer(labels, {
      elevationOf,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    type Ctx = { index: number; data: RegionLabel[]; target: number[] };
    const getPosition = layer.props.getPosition as (d: RegionLabel, ctx: Ctx) => Position;
    const ctx: Ctx = { index: 0, data: labels, target: [] };
    expect(getPosition(labels[0], ctx)).toEqual([127.1, 35.8, 1000]);
    expect(elevationOf).toHaveBeenCalledWith("52110");
  });

  it("getText delegates to textOf(code)", () => {
    const textOf = vi.fn((code: string) => `${code}!`);
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    type Ctx = { index: number; data: RegionLabel[]; target: number[] };
    const getText = layer.props.getText as (d: RegionLabel, ctx: Ctx) => string;
    const ctx: Ctx = { index: 0, data: labels, target: [] };
    expect(getText(labels[1], ctx)).toBe("52130!");
  });

  it("updateTriggers include the triggerKey for both getPosition and getText", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "indicator-7",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.updateTriggers.getPosition).toContain("indicator-7");
    expect(layer.props.updateTriggers.getText).toContain("indicator-7");
  });

  // 추가 요구 #2: labels must always draw on top of a taller neighboring
  // region, not get depth-tested away behind it. `depthCompare: 'always'`
  // (not `depthWriteEnabled: false` alone — that only stops the label from
  // *writing* depth, it would still be *tested* against and hidden by an
  // already-drawn taller neighbor) makes every fragment pass the depth test
  // unconditionally; confirmed against the installed luma.gl@9.4 types
  // (CompareFunction in @luma.gl/core's adapter/types/parameters.d.ts) and
  // against @deck.gl/core's CompositeLayer.getSubLayerProps, which forwards
  // `this.props.parameters` verbatim to every sub-layer TextLayer renders
  // (MultiIconLayer for characters, TextBackgroundLayer for background) — so
  // setting it once here on the outer TextLayer is sufficient.
  it("disables the depth test so labels always draw on top (추가 요구 #2)", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.parameters).toMatchObject({
      depthCompare: "always",
      depthWriteEnabled: false,
    });
  });

  // Task B, fix round 1 — 라벨 겹침 완화 (전주·익산·완주·김제)의 픽셀 넛지는 더 이상
  // 렌더 타임 getPixelOffset이 아니라 빌드 타임에 labelPoint 자체를 지리적으로
  // 옮기는 방식으로 옮겨감(scripts/pipeline/build-regions.ts). 이유:
  // CollisionFilterExtension의 충돌 가시성 샘플이 `geometry.worldPosition`(오프셋
  // 미반영 원본 앵커)을 직접 사용해서, getPixelOffset으로 텍스트만 앵커에서 멀리
  // 밀어내면 그 라벨이 "자기 자신"을 그 지점에서 찾지 못해 우선순위와 무관하게
  // 계속 안 보이는 문제(실측: 전주시·익산시)가 있었음 — task-B-report.md 참고.
  // getPixelOffset을 아예 쓰지 않으므로 deck.gl의 기본값([0,0], 고정 배열이지
  // 함수가 아님)으로 남아야 한다.
  it("does not set getPixelOffset — labels draw exactly at their anchor (deck.gl's own [0,0] default)", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.getPixelOffset).toEqual([0, 0]);
  });

  // Task A — 그림자 캐스팅 제외: TextLayer is a CompositeLayer whose leaf
  // sub-layers (MultiIconLayer for `characters`, TextBackgroundLayer for
  // `background`) never see a `shadowEnabled` prop passed directly on the
  // outer TextLayer — deck.gl's shadow pass reads `layer.props.shadowEnabled`
  // off whichever leaf layer actually draws, so it must be set via
  // `_subLayerProps` (confirmed against the installed
  // @deck.gl/core's composite-layer.js: `getSubLayerProps` merges
  // `_subLayerProps[id]` directly into each sub-layer's own final props).
  // Task B — now that `background: true` actually makes the `background`
  // sub-layer render (see the "renders a background chip" test above), this
  // exclusion is no longer hypothetical for it: confirmed against
  // text-layer.js's `renderLayers()` — the `background` sub-layer's props
  // come from `this.getSubLayerProps({id: 'background', ...})`, the SAME
  // CompositeLayer method that merges in `_subLayerProps.background`
  // regardless of whether the extension's own collision props are also
  // merged in afterward (disjoint keys — `shadowEnabled` isn't one of
  // CollisionFilterExtension's defaultProps, so neither can clobber the
  // other).
  it("excludes both sub-layers (characters, background) from shadow casting via _subLayerProps", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props._subLayerProps).toEqual({
      characters: { shadowEnabled: false },
      background: { shadowEnabled: false },
    });
  });

  describe("transitionDuration option (Task 6, Section A.4 — reduced motion)", () => {
    it("defaults to a 600ms getPosition transition when omitted", () => {
      const layer = makeRegionLabelLayer(labels, {
        elevationOf: () => 0,
        textOf: (code) => code,
        triggerKey: "v1",
        fontFamily: "Test Font",
        characterSet: ["a"],
      });
      expect(layer.props.transitions).toMatchObject({ getPosition: 600 });
    });

    it("zeroes the getPosition transition when transitionDuration: 0", () => {
      const layer = makeRegionLabelLayer(labels, {
        elevationOf: () => 0,
        textOf: (code) => code,
        triggerKey: "v1",
        fontFamily: "Test Font",
        characterSet: ["a"],
        transitionDuration: 0,
      });
      expect(layer.props.transitions).toBeUndefined(); // 0ms → omitted (no per-frame collision FBO re-render)
    });
  });
});

// Task B — CollisionFilterExtension: hides overlapping region-name chips
// instead of letting them stack illegibly. `collisionGroup: 'labels'` is
// SHARED with school-labels since Task D fix round 1 (see schoolLayers.ts /
// schoolLayers.test.ts): the installed @deck.gl/extensions'
// collision-filter-effect.js buckets layers into one FBO per
// `collisionGroup`, so sharing the group is what lets a 시군 chip (priority
// [-15, 1000]) out-rank and hide any school chip ([-1000, -100]) whose
// anchor it covers. `collisionTestProps` stays per-layer inside the group.
describe("makeRegionLabelLayer — CollisionFilterExtension (Task B)", () => {
  type Ctx = { index: number; data: RegionLabel[]; target: number[] };
  const ctxFor = (data: RegionLabel[]): Ctx => ({ index: 0, data, target: [] });

  it("attaches exactly one CollisionFilterExtension instance, collisionGroup 'labels', sizeScale 1.3", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    expect(layer.props.extensions).toHaveLength(1);
    expect(layer.props.extensions[0]).toBeInstanceOf(CollisionFilterExtension);
    expect(layer.props.collisionEnabled).toBe(true);
    expect(layer.props.collisionGroup).toBe("labels");
    expect(layer.props.collisionTestProps).toEqual({ sizeScale: 1.3 });
  });

  it("gives the selected region's label priority 1000, regardless of priorityOf", () => {
    const priorityOf = vi.fn(() => -5);
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52110",
      priorityOf,
    });
    const getCollisionPriority = layer.props.getCollisionPriority as (d: RegionLabel, ctx: Ctx) => number;
    expect(getCollisionPriority(labels[0], ctxFor(labels))).toBe(1000);
  });

  it("delegates to priorityOf(code) for a region that is NOT the selected one", () => {
    const priorityOf = vi.fn((code: string) => (code === "52130" ? 42 : -1));
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52110", // labels[1] (52130) is NOT selected
      priorityOf,
    });
    const getCollisionPriority = layer.props.getCollisionPriority as (d: RegionLabel, ctx: Ctx) => number;
    expect(getCollisionPriority(labels[1], ctxFor(labels))).toBe(42);
    expect(priorityOf).toHaveBeenCalledWith("52130");
  });

  // Mirrors DeckMap.tsx's real priorityOf (reversed rank — see
  // task-B-report.md): a region whose indicator VALUE is bigger gets a
  // HIGHER priority number (survives a collision over a smaller-value
  // neighbor); a region with no data at all (absent from the rank map)
  // gets the LOWEST priority of all.
  it("a bigger-value region outranks a smaller-value region, which outranks a no-data (null) region", () => {
    const rankOf = new Map([
      ["52110", 1], // biggest value -> rank 1
      ["52130", 2],
    ]);
    const priorityOf = (code: string): number => {
      const r = rankOf.get(code);
      return r === undefined ? -100 : -r;
    };
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: null,
      priorityOf,
    });
    const getCollisionPriority = layer.props.getCollisionPriority as (d: RegionLabel, ctx: Ctx) => number;
    const biggerValue = getCollisionPriority(labels[0], ctxFor(labels)); // 52110, rank 1
    const smallerValue = getCollisionPriority(labels[1], ctxFor(labels)); // 52130, rank 2
    expect(biggerValue).toBeGreaterThan(smallerValue);

    const noDataLabel: RegionLabel = { code: "99999", name: "?", position: [0, 0] };
    const noData = getCollisionPriority(noDataLabel, ctxFor(labels));
    expect(noData).toBeLessThan(smallerValue);
    expect(noData).toBeLessThan(biggerValue);
  });

  it("updateTriggers.getCollisionPriority includes both triggerKey and selectedCode", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "indicator-7",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52110",
      priorityOf: () => 0,
    });
    expect(layer.props.updateTriggers.getCollisionPriority).toEqual(["indicator-7", "52110"]);
  });

  // Backward compatibility (same pattern as RegionsLayerOptions.selectedCode
  // in regionLayers.ts): a caller that doesn't care about selection/priority
  // still gets a sensible, working layer.
  it("defaults selectedCode to null and priorityOf to a constant 0 when both are omitted", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    const getCollisionPriority = layer.props.getCollisionPriority as (d: RegionLabel, ctx: Ctx) => number;
    expect(getCollisionPriority(labels[0], ctxFor(labels))).toBe(0);
    expect(layer.props.updateTriggers.getCollisionPriority).toEqual(["v1", null]);
  });
});

// Task D — 선택 시군 라벨 z: the selected region's OWN label must clear the
// tallest a school column in it can ever get (SCHOOL_HEIGHT_MAX_M — see
// schoolVisuals.ts's makeSchoolHeightScale) plus the usual +200 clearance,
// so a forest of tall columns never pierces its own 시군 name chip. Every
// OTHER (non-selected) region's label is unaffected by this — its own
// schools are never even rendered (DeckMap only ever hands the schools
// layers the SELECTED region's schools) — so it keeps the plain +200.
describe("makeRegionLabelLayer — ground anchors regardless of selection", () => {
  type Ctx = { index: number; data: RegionLabel[]; target: number[] };
  const ctxFor = (data: RegionLabel[]): Ctx => ({ index: 0, data, target: [] });

  it("getPosition is elevationOf(code) for a NON-selected region", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
    const layer = makeRegionLabelLayer(labels, {
      elevationOf,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52130", // labels[0] (52110) is NOT the selected one
    });
    const getPosition = layer.props.getPosition as (d: RegionLabel, ctx: Ctx) => Position;
    expect(getPosition(labels[0], ctxFor(labels))).toEqual([127.1, 35.8, 1000]);
  });

  it("selected labels remain anchored at ground height", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
    const layer = makeRegionLabelLayer(labels, {
      elevationOf,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52110", // labels[0] IS the selected one
    });
    const getPosition = layer.props.getPosition as (d: RegionLabel, ctx: Ctx) => Position;
    expect(getPosition(labels[0], ctxFor(labels))).toEqual([127.1, 35.8, 1000]);
  });

  it("other region labels also stay at their ground height", () => {
    const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
    const layer = makeRegionLabelLayer(labels, {
      elevationOf,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52110", // labels[0] selected; labels[1] (52130) is not
    });
    const getPosition = layer.props.getPosition as (d: RegionLabel, ctx: Ctx) => Position;
    expect(getPosition(labels[1], ctxFor(labels))).toEqual([126.7, 35.9, 2000]);
  });

  it("updateTriggers.getPosition includes both triggerKey and selectedCode", () => {
    const layer = makeRegionLabelLayer(labels, {
      elevationOf: () => 0,
      textOf: (code) => code,
      triggerKey: "indicator-7",
      fontFamily: "Test Font",
      characterSet: ["a"],
      selectedCode: "52110",
    });
    expect(layer.props.updateTriggers.getPosition).toEqual(expect.arrayContaining(["indicator-7", "52110"]));
  });

  it("does not add artificial height when selectedCode is omitted", () => {
    const elevationOf = vi.fn(() => 1000);
    const layer = makeRegionLabelLayer(labels, {
      elevationOf,
      textOf: (code) => code,
      triggerKey: "v1",
      fontFamily: "Test Font",
      characterSet: ["a"],
    });
    const getPosition = layer.props.getPosition as (d: RegionLabel, ctx: Ctx) => Position;
    expect(getPosition(labels[0], ctxFor(labels))).toEqual([127.1, 35.8, 1000]);
  });
});
