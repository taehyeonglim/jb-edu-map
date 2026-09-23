import { describe, expect, it } from "vitest";

import { NULL_COLOR, luminance, makeColorScale, mix, paletteFor, parseColor } from "@/lib/colors";
import type { IndicatorDef } from "@/lib/indicators/types";
import { formatInt } from "@/lib/format";

function def(overrides: Partial<IndicatorDef> = {}): IndicatorDef {
  return {
    id: "x",
    group: "scale",
    label: "x",
    unit: "명",
    polarity: "neutral",
    kind: "ratio",
    format: formatInt,
    source: { name: "KESS", url: "https://example.com", year: 2026 },
    aggregate: { kind: "sum", field: "students" },
    description: "테스트용 설명",
    ...overrides,
  };
}

describe("parseColor", () => {
  it("parses an rgb(...) css string", () => {
    expect(parseColor("rgb(253, 211, 161)")).toEqual([253, 211, 161]);
  });

  it("parses a #rrggbb hex string (hex stops)", () => {
    // The light-theme palettes (colors.ts PALETTE_STOPS) are hex literals
    // parsed through this same function.
    expect(parseColor("#3b528b")).toEqual([0x3b, 0x52, 0x8b]);
  });

  it("throws on an unrecognized format", () => {
    expect(() => parseColor("not-a-color")).toThrow();
  });
});

describe("paletteFor", () => {
  it("returns 5 [r,g,b] triples for every polarity", () => {
    for (const polarity of ["higherWorse", "higherBetter", "neutral"] as const) {
      const palette = paletteFor(polarity);
      expect(palette).toHaveLength(5);
      for (const rgb of palette) {
        expect(rgb).toHaveLength(3);
        for (const c of rgb) {
          expect(c).toBeGreaterThanOrEqual(0);
          expect(c).toBeLessThanOrEqual(255);
        }
      }
    }
  });

  it("does not throw for neutral (hex stops must parse)", () => {
    expect(() => paletteFor("neutral")).not.toThrow();
  });

  it("uses a different palette per polarity", () => {
    const worse = paletteFor("higherWorse");
    const better = paletteFor("higherBetter");
    const neutral = paletteFor("neutral");
    expect(worse).not.toEqual(better);
    expect(worse).not.toEqual(neutral);
    expect(better).not.toEqual(neutral);
  });
});

describe("NULL_COLOR", () => {
  it("is a fixed slate color distinct from data values", () => {
    expect(NULL_COLOR).toEqual([96, 116, 134]);
  });

  it("differs from every stop of every ramp (never mistaken for a data step)", () => {
    for (const polarity of ["higherWorse", "higherBetter", "neutral"] as const) {
      for (const stop of paletteFor(polarity)) expect(stop).not.toEqual(NULL_COLOR);
    }
  });
});

// 밝은 디오라마 (spec §4, Task 2 fix round 1 ruling) — step 1 of every ramp is
// visibly darker than the paper floor (#f5f2eb) and the footprint plate
// ([255,252,246]); the original near-white stops clipped to white under the
// daylight lighting and could not be told from the floor.
describe("paletteFor — night HUD ramps", () => {
  it("higherWorse is dark coral → bright amber", () => {
    expect(paletteFor("higherWorse")).toEqual([
      [99, 55, 68],
      [139, 67, 80],
      [185, 86, 77],
      [229, 117, 75],
      [255, 173, 102],
    ]);
  });

  it("higherBetter is dark teal → bright mint", () => {
    expect(paletteFor("higherBetter")).toEqual([
      [23, 75, 85],
      [30, 108, 105],
      [34, 143, 123],
      [43, 185, 155],
      [114, 229, 189],
    ]);
  });

  it("neutral is dark indigo → bright violet", () => {
    expect(paletteFor("neutral")).toEqual([
      [48, 58, 108],
      [70, 87, 154],
      [95, 116, 196],
      [131, 152, 230],
      [176, 185, 255],
    ]);
  });

  it.each(["higherWorse", "higherBetter", "neutral"] as const)("%s step 1 is lighter than the dark map floor", (polarity) => {
    expect(luminance(paletteFor(polarity)[0])).toBeGreaterThan(luminance([8, 20, 33]));
  });

  it.each(["higherWorse", "higherBetter", "neutral"] as const)("%s luminance strictly increases", (polarity) => {
    const lums = paletteFor(polarity).map(luminance);
    for (let i = 1; i < lums.length; i++) expect(lums[i]).toBeGreaterThan(lums[i - 1]);
  });
});

describe("luminance", () => {
  it("is Rec. 709 luma in 0..1 (white 1, black 0, primaries 0.2126/0.7152/0.0722)", () => {
    expect(luminance([255, 255, 255])).toBeCloseTo(1, 10);
    expect(luminance([0, 0, 0])).toBe(0);
    expect(luminance([255, 0, 0])).toBeCloseTo(0.2126, 10);
    expect(luminance([0, 255, 0])).toBeCloseTo(0.7152, 10);
    expect(luminance([0, 0, 255])).toBeCloseTo(0.0722, 10);
  });
});

describe("mix", () => {
  it("t=0 returns the color, t=1 returns the target, t=0.5 the midpoint", () => {
    expect(mix([0, 0, 0], [255, 255, 255], 0)).toEqual([0, 0, 0]);
    expect(mix([0, 0, 0], [255, 255, 255], 1)).toEqual([255, 255, 255]);
    expect(mix([0, 0, 0], [255, 255, 255], 0.5)).toEqual([128, 128, 128]);
  });
});

describe("makeColorScale", () => {
  const map = new Map<string, number | null>([
    ["52110", 0],
    ["52130", 25],
    ["52140", 50],
    ["52150", 75],
    ["52160", 100],
    ["52170", null],
  ]);

  it("quantizes into 5 steps drawn from the polarity's palette, alpha always 255", () => {
    const { colorOf } = makeColorScale(def({ polarity: "higherWorse", domain: [0, 100] }), map);
    const palette = paletteFor("higherWorse");
    const lowColor = colorOf("52110");
    const highColor = colorOf("52160");
    expect(lowColor).toEqual([...palette[0], 255]);
    expect(highColor).toEqual([...palette[4], 255]);
    expect(lowColor[3]).toBe(255);
  });

  it("returns NULL_COLOR with alpha 255 for a null value", () => {
    const { colorOf } = makeColorScale(def({ domain: [0, 100] }), map);
    expect(colorOf("52170")).toEqual([...NULL_COLOR, 255]);
  });

  it("returns NULL_COLOR for a code missing from the map", () => {
    const { colorOf } = makeColorScale(def({ domain: [0, 100] }), map);
    expect(colorOf("99999")).toEqual([...NULL_COLOR, 255]);
  });

  it("exposes ticks as the domain ends plus 4 interior thresholds (6 total)", () => {
    const { ticks } = makeColorScale(def({ domain: [0, 100] }), map);
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0);
    expect(ticks[5]).toBe(100);
    // Interior thresholds are strictly increasing between the domain ends.
    for (let i = 1; i < ticks.length; i++) {
      expect(ticks[i]).toBeGreaterThan(ticks[i - 1]);
    }
  });

  it("derives its domain the same way domainOf does (count floors at 0)", () => {
    const countMap = new Map<string, number | null>([
      ["52110", 10],
      ["52130", 100],
    ]);
    const { ticks } = makeColorScale(def({ kind: "count" }), countMap);
    expect(ticks[0]).toBe(0);
    expect(ticks[5]).toBe(100);
  });
});

// Task 6, Section C-추가 #5 — count 지표 색 구간: count-kind indicators' 14
// 시군 values skew hard toward 전주시, so equal-WIDTH linear buckets leave
// most regions in the bottom step. Color buckets switch to quantile
// (equal-COUNT) for count-kind by default; height/domain stay linear
// (unaffected — this option only ever changes `colorOf`/`ticks`, never
// `domainOf`/makeElevationScale).
describe("makeColorScale — colorBuckets option (Task 6, Section C-추가 #5)", () => {
  // Skewed like a real count-kind indicator: low/clustered values + 2 big
  // outliers (전주시-like). 7 distinct values (> palette.length/5) so this
  // fixture actually exercises the quantile branch — fix round 1/5,
  // finding 1: with palette.length (5) or fewer distinct values,
  // makeColorScale now falls back to 'linear' regardless of what's
  // requested (see the "tied values" describe block below), so a fixture
  // meant to exercise "quantile mode" needs MORE than 5 distinct values.
  const skewedCodes = ["52110", "52130", "52140", "52180", "52190", "52210", "52310"];
  const skewedMap = new Map<string, number | null>([
    ["52110", 1000],
    ["52130", 3],
    ["52140", 2],
    ["52180", 1],
    ["52190", 0],
    ["52210", 500],
    ["52310", 10],
  ]);

  it("count-kind indicators default to quantile bucketing", () => {
    const { colorBuckets } = makeColorScale(def({ kind: "count" }), skewedMap);
    expect(colorBuckets).toBe("quantile");
  });

  it("ratio-kind indicators default to linear bucketing", () => {
    const { colorBuckets } = makeColorScale(def({ kind: "ratio" }), skewedMap);
    expect(colorBuckets).toBe("linear");
  });

  it("an explicit colorBuckets option overrides the kind-based default", () => {
    expect(makeColorScale(def({ kind: "ratio" }), skewedMap, { colorBuckets: "quantile" }).colorBuckets).toBe(
      "quantile",
    );
    expect(makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "linear" }).colorBuckets).toBe(
      "linear",
    );
  });

  it("quantile mode spreads a skewed dataset across distinct color buckets (linear clusters most into the bottom one)", () => {
    const linear = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "linear" });
    const linearColors = new Set(skewedCodes.map((c) => linear.colorOf(c).join(",")));
    // Linear (equal-width [0,1000] buckets, width 200): 0/1/2/3/10 all fall
    // in the bottom bucket alongside each other — far fewer distinct colors
    // than quantile mode manages below, among the same 7 regions.
    expect(linearColors.size).toBeLessThan(5);

    const quantile = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "quantile" });
    expect(quantile.colorBuckets).toBe("quantile"); // 7 distinct values > palette.length (5) — no fallback here
    const quantileColors = new Set(skewedCodes.map((c) => quantile.colorOf(c).join(",")));
    // Quantile (rank-based, over the 7 DEDUPLICATED distinct values): all 5
    // palette buckets get used, unlike linear's clustering above.
    expect(quantileColors.size).toBe(5);
  });

  it("still exposes 6 ticks (domain ends + 4 interior boundaries) — height/domain unaffected by bucket mode", () => {
    const { ticks } = makeColorScale(def({ kind: "count" }), skewedMap, { colorBuckets: "quantile" });
    expect(ticks).toHaveLength(6);
    expect(ticks[0]).toBe(0); // count-kind floors at 0, same domainOf() the elevation scale uses
    expect(ticks[5]).toBe(1000);
  });

  it("null values are still NULL_COLOR under quantile mode", () => {
    const map = new Map<string, number | null>([
      ["52110", 5],
      ["52130", null],
    ]);
    const { colorOf } = makeColorScale(def({ kind: "count" }), map);
    expect(colorOf("52130")).toEqual([...NULL_COLOR, 255]);
  });

  it("does not throw when every value is null (empty quantile domain fallback)", () => {
    const map = new Map<string, number | null>([
      ["52110", null],
      ["52130", null],
    ]);
    expect(() => makeColorScale(def({ kind: "count", domain: [0, 10] }), map)).not.toThrow();
  });

  // Fix round 2, finding 9 (controller ruling) — the fallback threshold is
  // now `distinctValues.length >= palette.length` (was `>`). With EXACTLY
  // palette.length (5) distinct values, a 5-quantile split still assigns
  // one distinct value to each of the 5 buckets cleanly — the previous `>`
  // threshold routed this exact case to 'linear' instead, which is what let
  // real closed_schools_unused data ([0×6,1×5,2,8,9], 5 distinct) cluster
  // into just 2 colors (dominated by the tied-at-0 low end) instead of
  // spreading across all 5. Reaching the quantile branch here is safe
  // because of fix round 1's OTHER change (still in effect): scaleQuantile's
  // domain is the DEDUPLICATED distinct values [0,1,2,8,9], not the raw
  // array, so the old tie-bucketing bug (bisect-right pushing a
  // domain-floor-tied value into the wrong bucket) doesn't recur — verified
  // below via the actual computed thresholds (0.8/1.6/4.4/8.2, from
  // scaleQuantile().domain([0,1,2,8,9]), confirmed empirically with
  // d3-scale directly — see this fix's report).
  it("uses quantile (not linear) for the real closed_schools_unused dataset — exactly palette.length distinct values", () => {
    const tiedValues = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 2, 8, 9];
    const tiedMap = new Map<string, number | null>(tiedValues.map((value, i) => [`code-${i}`, value]));
    const testDef = def({ kind: "count", polarity: "higherWorse" });

    const scale = makeColorScale(testDef, tiedMap);
    expect(scale.colorBuckets).toBe("quantile");
    expect(scale.ticks).toHaveLength(6);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks[5]).toBe(9);
    expect(scale.ticks[1]).toBeCloseTo(0.8);
    expect(scale.ticks[2]).toBeCloseTo(1.6);
    expect(scale.ticks[3]).toBeCloseTo(4.4);
    expect(scale.ticks[4]).toBeCloseTo(8.2);
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
    }

    // The value tied at the domain floor (0) reaches the FIRST palette
    // color rather than being pushed to the second (fix round 1's dedup fix
    // is what makes this hold even though this dataset is heavily tied) —
    // and all 5 palette colors actually get used across the 14 regions.
    const palette = paletteFor("higherWorse");
    expect(scale.colorOf("code-0")).toEqual([...palette[0], 255]); // value 0
    const colorsUsed = new Set(tiedValues.map((_, i) => scale.colorOf(`code-${i}`).join(",")));
    expect(colorsUsed.size).toBe(5);
  });

  // Keeps the sub-threshold fallback path covered now that the boundary
  // case (exactly 5 distinct values) moved to the quantile branch above.
  it("still falls back to linear below palette.length distinct values (4 distinct)", () => {
    const fourDistinct = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3];
    const map = new Map<string, number | null>(fourDistinct.map((value, i) => [`code-${i}`, value]));
    const testDef = def({ kind: "count", polarity: "higherWorse" });

    const scale = makeColorScale(testDef, map);
    expect(scale.colorBuckets).toBe("linear");
    expect(scale.ticks).toHaveLength(6);
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
    }

    // An explicit request for quantile is still overridden by the same
    // data-driven fallback (ColorScaleOptions is a request, not a
    // guarantee — see its own doc comment).
    const requested = makeColorScale(testDef, map, { colorBuckets: "quantile" });
    expect(requested.colorBuckets).toBe("linear");
  });

  it("uses quantile with strictly increasing ticks and all 5 colors for a 14-distinct-value dataset", () => {
    const distinct14 = [10, 20, 30, 40, 50, 60, 70, 80, 90, 200, 400, 700, 1000, 2000];
    const map14 = new Map<string, number | null>(distinct14.map((value, i) => [`code-${i}`, value]));
    const scale = makeColorScale(def({ kind: "count" }), map14);

    expect(scale.colorBuckets).toBe("quantile");
    expect(scale.ticks).toHaveLength(6);
    for (let i = 1; i < scale.ticks.length; i++) {
      expect(scale.ticks[i]).toBeGreaterThan(scale.ticks[i - 1]);
    }
    const colorsUsed = new Set(distinct14.map((_, i) => scale.colorOf(`code-${i}`).join(",")));
    expect(colorsUsed.size).toBe(5);
  });
});
