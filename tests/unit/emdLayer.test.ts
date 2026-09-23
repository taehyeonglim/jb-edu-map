import { describe, expect, it } from "vitest";
import type { FeatureCollection, MultiPolygon, Polygon } from "geojson";

import { makeEmdBoundaryLayer } from "@/components/map/layers/emdLayer";

// Feature 1: a Polygon with an outer ring + 1 hole -> 2 rings.
// Feature 2: a MultiPolygon with 2 parts — part A has just an outer ring,
// part B has an outer ring + 1 hole -> 3 rings.
// Total flattened rings: 5 (outer+holes across both features).
function fixture(): FeatureCollection<Polygon | MultiPolygon, { code: string; name: string }> {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { code: "1", name: "동A" },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
            [
              [2, 2],
              [4, 2],
              [4, 4],
              [2, 4],
              [2, 2],
            ],
          ],
        },
      },
      {
        type: "Feature",
        properties: { code: "2", name: "동B" },
        geometry: {
          type: "MultiPolygon",
          coordinates: [
            [
              [
                [20, 0],
                [30, 0],
                [30, 10],
                [20, 10],
                [20, 0],
              ],
            ],
            [
              [
                [40, 0],
                [50, 0],
                [50, 10],
                [40, 10],
                [40, 0],
              ],
              [
                [42, 2],
                [44, 2],
                [44, 4],
                [42, 4],
                [42, 2],
              ],
            ],
          ],
        },
      },
    ],
  };
}

describe("makeEmdBoundaryLayer", () => {
  it("is a non-pickable, non-shadow-casting, rounded-joint PathLayer with id 'emd-boundaries'", () => {
    const layer = makeEmdBoundaryLayer(fixture(), { elevation: 100, triggerKey: "v1" });
    expect(layer.props.id).toBe("emd-boundaries");
    expect(layer.props.widthUnits).toBe("pixels");
    expect(layer.props.jointRounded).toBe(true);
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.shadowEnabled).toBe(false);
  });

  // 밝은 디오라마 (spec §4) — a translucent gray line on the pastel top face
  // (the dark theme's translucent white would vanish on it).
  it("literal getWidth (1px) and getColor ([60,60,70,110]) — not per-datum accessors", () => {
    const layer = makeEmdBoundaryLayer(fixture(), { elevation: 100, triggerKey: "v1" });
    expect(layer.props.getWidth).toBe(1);
    expect(layer.props.getColor).toEqual([131, 230, 239, 150]);
  });

  it("flattens every Polygon/MultiPolygon ring (outer + holes) into {path} data, one entry per ring", () => {
    const layer = makeEmdBoundaryLayer(fixture(), { elevation: 0, triggerKey: "v1" });
    const data = layer.props.data as { path: [number, number][] }[];
    expect(data).toHaveLength(5); // 2 (feature 1: outer+hole) + 1 (feature 2 part A) + 2 (feature 2 part B: outer+hole)

    // The Polygon feature's hole ring is present, [lng,lat] pairs preserved.
    const holeRing = data.find((d) => d.path[0]?.[0] === 2 && d.path[0]?.[1] === 2);
    expect(holeRing).toBeDefined();
    expect(holeRing!.path).toEqual([
      [2, 2],
      [4, 2],
      [4, 4],
      [2, 4],
      [2, 2],
    ]);

    // The MultiPolygon's second part's hole ring is also present.
    const secondPartHole = data.find((d) => d.path[0]?.[0] === 42 && d.path[0]?.[1] === 2);
    expect(secondPartHole).toBeDefined();
  });

  it("getPath appends elevation+3 as the z coordinate for every point of a ring", () => {
    const layer = makeEmdBoundaryLayer(fixture(), { elevation: 1000, triggerKey: "v1" });
    const data = layer.props.data as { path: [number, number][] }[];
    type Ctx = { index: number; data: typeof data; target: number[] };
    const getPath = layer.props.getPath as unknown as (
      d: (typeof data)[number],
      ctx: Ctx,
    ) => [number, number, number][];
    const ctx: Ctx = { index: 0, data, target: [] };
    const outerRing = data.find((d) => d.path.length === 5 && d.path[0][0] === 0)!;
    expect(getPath(outerRing, ctx)).toEqual([
      [0, 0, 1003],
      [10, 0, 1003],
      [10, 10, 1003],
      [0, 10, 1003],
      [0, 0, 1003],
    ]);
  });

  it("updateTriggers.getPath is [triggerKey, elevation]", () => {
    const layer = makeEmdBoundaryLayer(fixture(), { elevation: 250, triggerKey: "indicator-7" });
    expect(layer.props.updateTriggers.getPath).toEqual(["indicator-7", 250]);
  });

  it("defaults to a 600ms getPath transition; a custom transitionDuration overrides it (reduced-motion -> 0)", () => {
    const defaultLayer = makeEmdBoundaryLayer(fixture(), { elevation: 0, triggerKey: "v1" });
    expect(defaultLayer.props.transitions).toMatchObject({ getPath: 600 });

    const instantLayer = makeEmdBoundaryLayer(fixture(), { elevation: 0, triggerKey: "v1", transitionDuration: 0 });
    expect(instantLayer.props.transitions).toBeUndefined(); // 0ms → omitted
  });

  // Task E brief: "훅 결과가 바뀔 때만 useMemo 로 1회 생성(참조 고정)" — the
  // flattened `data` array must keep the SAME reference across repeated
  // calls with the SAME `fc` object, even when `opts` (elevation/triggerKey)
  // differs — DeckMap's `layers` useMemo recomputes on every indicator
  // switch, but the useEmdBoundaries hook's own `fc` result only changes
  // when a genuinely new 시군's fetch resolves. Without this, PathLayer
  // would get a brand-new `data` reference (and re-tessellate its buffers)
  // on every unrelated re-render.
  describe("flattened data reference stability (module-scope cache keyed by fc identity)", () => {
    it("the SAME fc reference always produces the SAME flattened data reference, regardless of changing opts", () => {
      const fc = fixture();
      const layerA = makeEmdBoundaryLayer(fc, { elevation: 100, triggerKey: "a" });
      const layerB = makeEmdBoundaryLayer(fc, { elevation: 200, triggerKey: "b" });
      expect(layerA.props.data).toBe(layerB.props.data);
    });

    it("two DIFFERENT (structurally-identical) fc objects get DIFFERENT flattened data references — no cross-object false cache hit", () => {
      const layerA = makeEmdBoundaryLayer(fixture(), { elevation: 100, triggerKey: "a" });
      const layerB = makeEmdBoundaryLayer(fixture(), { elevation: 100, triggerKey: "a" });
      expect(layerA.props.data).not.toBe(layerB.props.data);
    });
  });
});
