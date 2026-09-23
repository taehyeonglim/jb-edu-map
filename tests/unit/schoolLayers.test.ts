import { describe, expect, it, vi } from "vitest";
import type { Color, Position } from "@deck.gl/core";
import { ColumnLayer } from "@deck.gl/layers";
import { CollisionFilterExtension } from "@deck.gl/extensions";

import { hasCoordinates, makeSchoolLabelsLayer, makeSchoolsLayer } from "@/components/map/layers/schoolLayers";
import { REGION_MATERIAL } from "@/components/map/lighting";
import { makeSchoolHeightScale, SCHOOL_LEVEL_COLORS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";
import type { School } from "@/lib/schools/types";

function school(overrides: Partial<School> & Pick<School, "id" | "regionCode">): School {
  return {
    name: `학교${overrides.id}`,
    level: "elem",
    status: "운영",
    branch: false,
    lat: 35.8,
    lng: 127.1,
    students: 100,
    classes: 5,
    teachers: 10,
    studentsPerClass: 20,
    small: false,
    ...overrides,
  };
}

type Ctx = { index: number; data: School[]; target: number[] };
const ctxFor = (data: School[]): Ctx => ({ index: 0, data, target: [] });

describe("makeSchoolHeightScale — 높이 매핑 범위 (Task D)", () => {
  it("maps the smallest student count to the minimum height and the largest to the maximum", () => {
    const schools = [school({ id: "a", regionCode: "52110", students: 10 }), school({ id: "b", regionCode: "52110", students: 1000 })];
    const heightOf = makeSchoolHeightScale(schools);
    expect(heightOf(10)).toBeCloseTo(150, 5);
    expect(heightOf(1000)).toBeCloseTo(1400, 5);
  });

  it("maps null (no student count) to the minimum height", () => {
    const schools = [school({ id: "a", regionCode: "52110", students: 10 }), school({ id: "b", regionCode: "52110", students: 1000 })];
    const heightOf = makeSchoolHeightScale(schools);
    expect(heightOf(null)).toBe(150);
  });

  it("stays within [150, 1400] for every value in between, monotonically increasing", () => {
    const schools = Array.from({ length: 20 }, (_, i) => school({ id: `s${i}`, regionCode: "52110", students: (i + 1) * 37 }));
    const heightOf = makeSchoolHeightScale(schools);
    let prev = -Infinity;
    for (const s of schools) {
      const h = heightOf(s.students);
      expect(h).toBeGreaterThanOrEqual(150);
      expect(h).toBeLessThanOrEqual(1400);
      expect(h).toBeGreaterThanOrEqual(prev);
      prev = h;
    }
  });

  it("does not rescale when computed from the full list, even if a filtered subset has a narrower range", () => {
    const all = [
      school({ id: "a", regionCode: "52110", students: 10 }),
      school({ id: "b", regionCode: "52130", students: 1000 }),
    ];
    const heightOf = makeSchoolHeightScale(all); // computed from the FULL list
    const onlyRegionA = [all[0]]; // as if region 52110 alone were selected
    // heightOf itself is unaffected by which subset is later rendered.
    expect(heightOf(onlyRegionA[0].students)).toBeCloseTo(150, 5);
    expect(heightOf(1000)).toBeCloseTo(1400, 5); // still resolvable even though not in the subset
  });

  it("maps an empty school list to a constant minimum-height function", () => {
    const heightOf = makeSchoolHeightScale([]);
    expect(heightOf(500)).toBe(150);
    expect(heightOf(null)).toBe(150);
  });
});

describe("SCHOOL_LEVEL_COLORS — 급별 색 alpha 255", () => {
  it("every school level has an explicit opaque (alpha 255) color", () => {
    for (const level of SCHOOL_LEVEL_ORDER) {
      const [, , , a] = SCHOOL_LEVEL_COLORS[level];
      expect(a).toBe(255);
    }
  });

  it("all 4 colors are distinct", () => {
    const values = SCHOOL_LEVEL_ORDER.map((l) => SCHOOL_LEVEL_COLORS[l].join(","));
    expect(new Set(values).size).toBe(4);
  });

  // 밝은 디오라마 (spec §5) — deeper, more saturated hues than the dark theme's
  // pastel-on-dark set, so a column reads against a light pastel top face.
  it("SCHOOL_LEVEL_COLORS are vivid against the dark map", () => {
    expect(SCHOOL_LEVEL_COLORS.elem).toEqual([67, 207, 224, 255]);
    expect(SCHOOL_LEVEL_COLORS.mid).toEqual([242, 184, 92, 255]);
    expect(SCHOOL_LEVEL_COLORS.high).toEqual([242, 140, 98, 255]);
    expect(SCHOOL_LEVEL_COLORS.special).toEqual([130, 226, 199, 255]);
  });
});

describe("makeSchoolsLayer (Task D — ColumnLayer)", () => {
  const heightOf = vi.fn((students: number | null) => (students === 100 ? 500 : 150));
  const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
  const baseOpts = { elevationOf, heightOf, heightKey: "stats-2026-04-01", visible: true, triggerKey: "v1" };

  it("is a pickable, auto-highlighting ColumnLayer with id 'schools'", () => {
    const layer = makeSchoolsLayer([], baseOpts);
    expect(layer).toBeInstanceOf(ColumnLayer);
    expect(layer.props.id).toBe("schools");
    expect(layer.props.pickable).toBe(true);
    expect(layer.props.autoHighlight).toBe(true);
    expect(layer.props.radiusUnits).toBe("pixels");
    expect(layer.props.radius).toBe(4);
    expect(layer.props.diskResolution).toBe(10);
    expect(layer.props.extruded).toBe(true);
    expect(layer.props.flatShading).toBe(true);
    expect(layer.props.material).toBe(REGION_MATERIAL);
    // 밝은 디오라마 — hover/selection darkens the column (black @ 70/255)
    // instead of the dark theme's white wash.
    expect(layer.props.highlightColor).toEqual([0, 0, 0, 70]);
  });

  it("visible 토글: reflects the given `visible` option", () => {
    const visibleLayer = makeSchoolsLayer([], { ...baseOpts, visible: true });
    const hiddenLayer = makeSchoolsLayer([], { ...baseOpts, visible: false });
    expect(visibleLayer.props.visible).toBe(true);
    expect(hiddenLayer.props.visible).toBe(false);
  });

  // Task D — the column stands ON the region's top face: z is exactly
  // elevationOf(regionCode), no manual offset (unlike the old
  // ScatterplotLayer's `+50`, which compensated for a flat point marker
  // otherwise sitting exactly at the top face and z-fighting it).
  // ColumnLayer's own geometry (installed column-geometry.ts, height:2
  // template) + vertex shader (column-layer-vertex.glsl.ts:
  // `elevation = instanceElevations * (positions.z + 1.0) / 2.0 * ...`)
  // already put the column's BASE at getPosition's z and its TOP at
  // getPosition.z + getElevation(d) — verified directly against the
  // installed source, not assumed.
  it("getPosition is exactly [lng, lat, elevationOf(regionCode)] — no offset", () => {
    const layer = makeSchoolsLayer([], baseOpts);
    const d = school({ id: "a", regionCode: "52110", lat: 35.5, lng: 127.2 });
    const getPosition = layer.props.getPosition as (d: School, ctx: Ctx) => Position;
    expect(getPosition(d, ctxFor([d]))).toEqual([127.2, 35.5, 1000]);
    expect(elevationOf).toHaveBeenCalledWith("52110");
  });

  it("getElevation delegates to the injected heightOf(students)", () => {
    const layer = makeSchoolsLayer([], baseOpts);
    const d = school({ id: "a", regionCode: "52110", students: 100 });
    const getElevation = layer.props.getElevation as (d: School, ctx: Ctx) => number;
    expect(getElevation(d, ctxFor([d]))).toBe(500);
    expect(heightOf).toHaveBeenCalledWith(100);
  });

  it("getFillColor uses the 학교급 color, alpha 255", () => {
    const layer = makeSchoolsLayer([], baseOpts);
    const d = school({ id: "a", regionCode: "52110", level: "high" });
    const getFillColor = layer.props.getFillColor as (d: School, ctx: Ctx) => Color;
    expect(getFillColor(d, ctxFor([d]))).toEqual(SCHOOL_LEVEL_COLORS.high);
  });

  // Task D — highlight moved from a custom getLineColor/getLineWidth stroke
  // toggle (meaningless on an EXTRUDED column — `stroked` only affects
  // ColumnLayer's flat/non-extruded disk mode, confirmed against the
  // installed column-layer.ts's shader: the stroke branch is
  // `else if (column.stroked)`, mutually exclusive with the `extruded`
  // branch) to deck.gl's own `highlightedObjectIndex` + `highlightColor`
  // picking-based recolor.
  describe("highlightedObjectIndex (강조 — Task D)", () => {
    it("is null (not -1) when no school is highlighted", () => {
      const layer = makeSchoolsLayer([], { ...baseOpts, highlightedId: null });
      expect(layer.props.highlightedObjectIndex).toBeNull();
    });

    it("is null (not -1) when highlightedId is omitted entirely", () => {
      const layer = makeSchoolsLayer([], baseOpts);
      expect(layer.props.highlightedObjectIndex).toBeNull();
    });

    // deck.gl's own `updateAutoHighlight` (installed @deck.gl/core's
    // layer.ts:1306) only runs the hover-highlight path
    // `if (autoHighlight && !Number.isInteger(highlightedObjectIndex))`.
    // `Number.isInteger(-1)` is TRUE, so the literal `-1` sentinel
    // `Array.prototype.findIndex` returns when nothing matches would — if
    // used here — permanently defeat `autoHighlight: true` above (hover
    // would never highlight anything again, for the life of the layer),
    // even though both `autoHighlight` and a non-default `highlightColor`
    // are explicitly configured on this layer. `null` is deck.gl's own
    // documented "nothing explicitly highlighted" default and keeps hover
    // working; verified directly against the installed source (not merely
    // assumed) — see makeSchoolsLayer's own implementation comment.
    it("is null (not -1) when highlightedId doesn't match any school in data", () => {
      const d = school({ id: "a", regionCode: "52110" });
      const layer = makeSchoolsLayer([d].filter(hasCoordinates), { ...baseOpts, highlightedId: "does-not-exist" });
      expect(layer.props.highlightedObjectIndex).not.toBe(-1);
      expect(layer.props.highlightedObjectIndex).toBeNull();
    });

    it("is the matching school's index in `data` when highlightedId matches", () => {
      const a = school({ id: "a", regionCode: "52110" });
      const b = school({ id: "b", regionCode: "52110" });
      const c = school({ id: "target", regionCode: "52110" });
      const layer = makeSchoolsLayer([a, b, c].filter(hasCoordinates), { ...baseOpts, highlightedId: "target" });
      expect(layer.props.highlightedObjectIndex).toBe(2);
    });
  });

  it("updateTriggers include triggerKey (via getPosition) and heightKey (via getElevation)", () => {
    const layer = makeSchoolsLayer([], {
      ...baseOpts,
      triggerKey: "students_total",
      heightKey: "stats-2026-04-01",
    });
    expect(layer.props.updateTriggers.getPosition).toContain("students_total");
    expect(layer.props.updateTriggers.getElevation).toContain("stats-2026-04-01");
  });

  // Task D — the old flat ScatterplotLayer needed `depthCompare: 'always'`
  // (always draw on top, never depth-tested away) because a flat point
  // marker has no real "front/back" of its own to test. A real, EXTRUDED 3D
  // column is the opposite: it must be depth-tested normally against every
  // other column/region so nearer geometry correctly occludes farther
  // geometry — so `parameters` is no longer set at all here, leaving
  // deck.gl's own default (`{}` — @deck.gl/core's layer.ts default depth
  // test+write both on), same as makeRegionsLayer's extruded body.
  it("does not override depth-test parameters — a real 3D column needs normal depth testing", () => {
    const layer = makeSchoolsLayer([], baseOpts);
    expect(layer.props.parameters).toEqual({});
  });

  it("forwards clicks with the clicked school's id", () => {
    const onClick = vi.fn();
    const layer = makeSchoolsLayer([], { ...baseOpts, onClick });
    const d = school({ id: "clicked-id", regionCode: "52110" });
    // @ts-expect-error — minimal PickingInfo stub for this unit test.
    layer.props.onClick({ object: d }, {});
    expect(onClick).toHaveBeenCalledWith("clicked-id");
  });

  it("uses a 600ms transition on both getPosition and getElevation", () => {
    const layer = makeSchoolsLayer([], baseOpts);
    expect(layer.props.transitions).toMatchObject({ getPosition: 600, getElevation: 600 });
  });

  it("zeroes both transitions when transitionDuration: 0 (Task 6, Section A.4 — reduced motion)", () => {
    const layer = makeSchoolsLayer([], { ...baseOpts, transitionDuration: 0 });
    expect(layer.props.transitions).toBeUndefined(); // 0ms → omitted
  });
});

describe("makeSchoolLabelsLayer", () => {
  const elevationOf = vi.fn((code: string) => (code === "52110" ? 1000 : 2000));
  const heightOf = vi.fn((students: number | null) => (students === 100 ? 500 : 150));
  const baseOpts = {
    elevationOf,
    heightOf,
    heightKey: "stats-2026-04-01",
    visible: true,
    fontFamily: "Test Font",
    characterSet: ["a"],
    triggerKey: "v1",
  };

  it("is a TextLayer with id 'school-labels', 11px size, billboarded", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    expect(layer.props.id).toBe("school-labels");
    expect(layer.props.getSize).toBe(11);
    expect(layer.props.billboard).toBe(true);
    expect(layer.props.fontFamily).toBe("Test Font");
    expect(layer.props.characterSet).toEqual(["a"]);
  });

  it("getText returns the school's name", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    const d = school({ id: "a", regionCode: "52110", name: "무주초등학교" });
    const getText = layer.props.getText as (d: School, ctx: Ctx) => string;
    expect(getText(d, ctxFor([d]))).toBe("무주초등학교");
  });

  // Task D — z now tracks each school's OWN column top (elevationOf +
  // heightOf(students)) + a fixed 30m clearance, replacing the old constant
  // +80 offset (which assumed a flat point marker sitting at elevationOf+50
  // — meaningless now that height varies per school).
  it("getPosition is elevationOf(regionCode) + heightOf(students)", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    const d = school({ id: "a", regionCode: "52110", students: 100, lat: 35.5, lng: 127.2 });
    const getPosition = layer.props.getPosition as (d: School, ctx: Ctx) => Position;
    // elevationOf("52110") = 1000, heightOf(100) = 500 -> 1000 + 500 + 30
    expect(getPosition(d, ctxFor([d]))).toEqual([127.2, 35.5, 1500]);
    expect(elevationOf).toHaveBeenCalledWith("52110");
    expect(heightOf).toHaveBeenCalledWith(100);
  });

  it("updateTriggers.getPosition includes both triggerKey and heightKey", () => {
    const layer = makeSchoolLabelsLayer([], { ...baseOpts, triggerKey: "indicator-7", heightKey: "stats-9" });
    expect(layer.props.updateTriggers.getPosition).toEqual(expect.arrayContaining(["indicator-7", "stats-9"]));
  });

  // Task B — SCHOOL_LABEL_MIN_ZOOM 11 -> 10 (DeckMap.tsx); this factory has
  // no zoom awareness of its own, so the change is purely in what the
  // caller computes for `visible` — pinned here to keep the description in
  // sync with DeckMap.tsx's actual threshold.
  it("visible 토글: reflects the given `visible` option (zoom>=10 && region selected, computed by the caller)", () => {
    const visibleLayer = makeSchoolLabelsLayer([], { ...baseOpts, visible: true });
    const hiddenLayer = makeSchoolLabelsLayer([], { ...baseOpts, visible: false });
    expect(visibleLayer.props.visible).toBe(true);
    expect(hiddenLayer.props.visible).toBe(false);
  });

  it("disables the depth test", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    expect(layer.props.parameters).toMatchObject({ depthCompare: "always", depthWriteEnabled: false });
  });

  // Task A — same reasoning/mechanism as labelLayer.test.ts's own
  // _subLayerProps assertion: school-labels is also a TextLayer, so its
  // shadow-casting exclusion must go through _subLayerProps (an outer
  // `shadowEnabled` prop never reaches the characters/background leaf
  // sub-layers deck.gl's shadow pass actually checks).
  it("excludes both sub-layers (characters, background) from shadow casting via _subLayerProps", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    expect(layer.props._subLayerProps).toEqual({
      characters: { shadowEnabled: false },
      background: { shadowEnabled: false },
    });
  });

  it("zeroes the getPosition transition when transitionDuration: 0 (Task 6, Section A.4 — reduced motion)", () => {
    const layer = makeSchoolLabelsLayer([], { ...baseOpts, transitionDuration: 0 });
    expect(layer.props.transitions).toBeUndefined(); // 0ms → omitted
  });

  // Task D, fix round 1 — CollisionFilterExtension: collisionGroup is now
  // 'labels', the SAME group region-labels uses (was a separate
  // 'school-labels' group — see labelLayer.test.ts). Review finding: two
  // separate groups meant region-labels and school-labels never arbitrated
  // against each other at all (one collision FBO per group), so a region
  // chip could be painted over by an ordinary school chip regardless of
  // priority. `collisionTestProps` stays a PER-LAYER override even inside a
  // shared group (installed collision-filter-extension.ts's
  // `initializeState`: `this.props = this.clone(this.props.collisionTestProps).props`).
  it("attaches exactly one CollisionFilterExtension instance, collisionGroup 'labels' (shared with region-labels), sizeScale 1.6", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    expect(layer.props.extensions).toHaveLength(1);
    expect(layer.props.extensions[0]).toBeInstanceOf(CollisionFilterExtension);
    expect(layer.props.collisionEnabled).toBe(true);
    expect(layer.props.collisionGroup).toBe("labels");
    expect(layer.props.collisionTestProps).toEqual({ sizeScale: 1.6, getPixelOffset: [0, 0], getAlignmentBaseline: "center" });
  });

  // Task D, fix round 1 — now that school-labels shares region-labels' own
  // collisionGroup, a school's priority must also be compared against
  // REGION-label priorities (labelLayer.ts: unselected -15..-1, selected
  // 1000 — see DeckMap.tsx's priorityOf, REGION_CODES.length === 14).
  // Mapping raw student count to [-1000, -100] (strictly below every
  // region-label priority) means a school chip can never outrank — and so
  // never hide — a 시군 chip, while still preferring a bigger school over a
  // smaller one WITHIN the school-only comparisons.
  it("getCollisionPriority maps student count to [-1000, -100] — strictly below every region-label priority ([-15, 1000])", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    const getCollisionPriority = layer.props.getCollisionPriority as (d: School, ctx: Ctx) => number;
    const cases: [number | null, number][] = [
      [null, -1000],
      [0, -1000],
      [500, -500],
      [900, -100],
      [1607, -100], // 군산금빛초등학교's real count — still clamped at the 900 cap
    ];
    for (const [students, expected] of cases) {
      const s = school({ id: `s-${students}`, regionCode: "52110", students });
      expect(getCollisionPriority(s, ctxFor([s]))).toBe(expected);
    }
  });

  it("getCollisionPriority is always strictly less than -15 (the lowest possible region-label priority — REGION_CODES.length === 14)", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    const getCollisionPriority = layer.props.getCollisionPriority as (d: School, ctx: Ctx) => number;
    for (const students of [null, 0, 1, 500, 899, 900, 1607, 1_000_000]) {
      const s = school({ id: `s-${students}`, regionCode: "52110", students });
      expect(getCollisionPriority(s, ctxFor([s]))).toBeLessThan(-15);
    }
  });

  // Task B — 칩 배경은 더 작게 (smaller than region-labels' [6,3]/6 — see
  // labelLayer.test.ts's "renders a background chip" test). 밝은 디오라마
  // (spec §5): same white-chip/ink-text/white-outline colors as region-labels.
  it("renders a smaller white background chip than region-labels, same ink text", () => {
    const layer = makeSchoolLabelsLayer([], baseOpts);
    expect(layer.props.background).toBe(true);
    expect(layer.props.getBackgroundColor).toEqual([18, 36, 56, 235]);
    expect(layer.props.getColor).toEqual([235, 245, 252, 255]);
    expect(layer.props.outlineColor).toEqual([18, 36, 56, 255]);
    expect(layer.props.backgroundPadding).toEqual([4, 2]);
    expect(layer.props.backgroundBorderRadius).toBe(4);
  });
});

// fix-round-2 (review finding #1): a 특수학교 row has lat/lng: null (no
// location-source coordinate — see School.locationMissingReason). Neither
// layer has anywhere to plot such a school. Dropping it is no longer the
// FACTORY's job (see below) — it's now a type-guard the caller (DeckMap.tsx)
// applies once, so this just verifies the predicate itself.
describe("hasCoordinates (fix-round-2, review finding #1)", () => {
  it("is true for a school with both lat and lng set", () => {
    const s = school({ id: "a", regionCode: "52110", lat: 35.8, lng: 127.1 });
    expect(hasCoordinates(s)).toBe(true);
  });

  it("is false for a school with lat/lng null (특수학교 — see locationMissingReason)", () => {
    const s = school({
      id: "b",
      regionCode: "52110",
      level: "special",
      lat: null,
      lng: null,
      locationMissingReason: "특수학교는 위치 표준데이터(2026-03-20)에 없음",
    });
    expect(hasCoordinates(s)).toBe(false);
  });
});

// fix-round-2 (review finding #1): makeSchoolsLayer/makeSchoolLabelsLayer
// used to call an internal `withCoordinates()` filter on EVERY invocation,
// which allocated a brand-new `data` array each time — reference-unequal to
// the previous one even with byte-for-byte identical contents. Since both
// factories are called inside DeckMap's `layers` useMemo (whose deps include
// highlightedSchoolId/handleSchoolClick), every highlight click handed
// deck.gl a new `data` identity, which deck.gl treats as "the whole dataset
// changed" (`invalidateAll()`) — defeating the layers' own scoped
// `updateTriggers`. The fix moves filtering to DeckMap.tsx's own
// `useMemo(() => regionSchools.filter(hasCoordinates), [regionSchools])`,
// computed once and handed to both factories; the factories below now just
// assign `data: schools` — no filtering, no new allocation, no matter how
// many times or how often they're called with the SAME input array.
//
// Task D — this contract matters MORE now, not less: `highlightedObjectIndex`
// is derived via `data.findIndex(...)` on every call, but that's a cheap
// O(n) scan over the SAME array reference, not a new allocation — it still
// must never change `layer.props.data` itself.
describe("makeSchoolsLayer / makeSchoolLabelsLayer — data reference stability (fix-round-2, review finding #1)", () => {
  const positioned = [school({ id: "a", regionCode: "52110", lat: 35.8, lng: 127.1 })].filter(hasCoordinates);
  const opts = { elevationOf: () => 1000, heightOf: () => 500, heightKey: "k1", visible: true, triggerKey: "v1" };
  const labelOpts = {
    elevationOf: () => 1000,
    heightOf: () => 500,
    heightKey: "k1",
    visible: true,
    fontFamily: "Test Font",
    characterSet: ["a"],
    triggerKey: "v1",
  };

  it("makeSchoolsLayer's data is the exact same array reference it was given, not a re-filtered copy", () => {
    const layer = makeSchoolsLayer(positioned, opts);
    expect(layer.props.data).toBe(positioned);
  });

  it("makeSchoolLabelsLayer's data is the exact same array reference it was given, not a re-filtered copy", () => {
    const layer = makeSchoolLabelsLayer(positioned, labelOpts);
    expect(layer.props.data).toBe(positioned);
  });

  it("calling makeSchoolsLayer twice with the SAME input array yields the SAME data reference both times", () => {
    const layer1 = makeSchoolsLayer(positioned, opts);
    const layer2 = makeSchoolsLayer(positioned, opts);
    expect(layer1.props.data).toBe(layer2.props.data);
  });

  it("changing only highlightedId does not change data identity (the bug this fix addresses)", () => {
    const notHighlighted = makeSchoolsLayer(positioned, { ...opts, highlightedId: null });
    const highlighted = makeSchoolsLayer(positioned, { ...opts, highlightedId: "a" });
    expect(notHighlighted.props.data).toBe(highlighted.props.data);
    expect(notHighlighted.props.data).toBe(positioned);
  });
});
