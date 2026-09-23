import { describe, expect, it, vi } from "vitest";
import { SolidPolygonLayer } from "@deck.gl/layers";
import type { BitmapLayer } from "@deck.gl/layers";

import { CONTROLLER } from "@/components/map/camera";
import { BASEMAP_COVERAGE, makeBasemapLayer, makeBasemapWashLayer, vworldTileUrl } from "@/components/map/layers/basemapLayer";

describe("vworldTileUrl", () => {
  it("builds the VWorld WMTS midnight URL template, row=y col=x", () => {
    expect(vworldTileUrl("mykey")).toBe(
      "https://api.vworld.kr/req/wmts/1.0.0/mykey/midnight/{z}/{y}/{x}.png",
    );
  });

  it("accepts a different layer name (defaults to 'midnight')", () => {
    expect(vworldTileUrl("mykey", "white")).toBe(
      "https://api.vworld.kr/req/wmts/1.0.0/mykey/white/{z}/{y}/{x}.png",
    );
  });

  // Task 3 (bright diorama) — VWorld's URL rule is the same for every layer
  // except the file extension: `Satellite` is jpeg, the rest png (spec
  // "검증된 사실").
  it("takes an extension: Satellite tiles are jpeg, Base defaults to png", () => {
    expect(vworldTileUrl("k", "Satellite", "jpeg")).toBe(
      "https://api.vworld.kr/req/wmts/1.0.0/k/Satellite/{z}/{y}/{x}.jpeg",
    );
    expect(vworldTileUrl("k", "Base")).toBe(
      "https://api.vworld.kr/req/wmts/1.0.0/k/Base/{z}/{y}/{x}.png",
    );
  });

  it("is a pure function of its inputs — same key always yields the same URL", () => {
    expect(vworldTileUrl("abc")).toBe(vworldTileUrl("abc"));
  });
});

describe("makeBasemapLayer", () => {
  it("has id 'basemap' and data = the Satellite jpeg template in satellite mode", () => {
    const layer = makeBasemapLayer("mykey", "satellite");
    expect(layer.props.id).toBe("basemap");
    expect(layer.props.data).toBe(vworldTileUrl("mykey", "Satellite", "jpeg"));
  });

  it("satellite mode requests Satellite jpeg tiles; base mode requests Base png tiles", () => {
    expect(makeBasemapLayer("k", "night").props.data).toBe(vworldTileUrl("k", "midnight", "png"));
    expect(makeBasemapLayer("k", "satellite").props.data).toBe(
      vworldTileUrl("k", "Satellite", "jpeg"),
    );
    expect(makeBasemapLayer("k", "base").props.data).toBe(vworldTileUrl("k", "Base", "png"));
  });

  it("tileSize 256, minZoom 6, maxZoom 18, maxRequests 6, zoomOffset -1, maxCacheSize 64 (both modes)", () => {
    for (const tiles of ["satellite", "base"] as const) {
      const layer = makeBasemapLayer("mykey", tiles);
      expect(layer.props.tileSize).toBe(256);
      expect(layer.props.minZoom).toBe(6);
      expect(layer.props.maxZoom).toBe(18);
      expect(layer.props.maxRequests).toBe(6);
      // 성능 조정 (2026-09-22): coarser tiles under the wash + a bounded cache.
      expect(layer.props.zoomOffset).toBe(tiles === "base" ? 0 : -1);
      expect(layer.props.maxCacheSize).toBe(64);
    }
  });

  // Final review ruling: the tile extent is the fixed BASEMAP_COVERAGE
  // rectangle (shared with the wash ring), NOT CONTROLLER.maxBounds — tiles
  // straddling a maxBounds-sized extent left a hard "map sheet" edge on the
  // paper floor at the overview.
  it("extent is the fixed BASEMAP_COVERAGE rectangle [120, 30, 135, 41]", () => {
    const layer = makeBasemapLayer("mykey", "satellite");
    expect(layer.props.extent).toEqual([120, 30, 135, 41]);
    expect(layer.props.extent).toEqual([BASEMAP_COVERAGE.west, BASEMAP_COVERAGE.south, BASEMAP_COVERAGE.east, BASEMAP_COVERAGE.north]);
  });

  // REQUIRED: TileLayer's own default onTileError is console.error — 8 of
  // this suite's e2e specs assert zero console errors, and VWorld returns
  // 200 + an XML ExceptionReport (not a 404) for a bad key, which fails PNG
  // decode and lands here. A no-op keeps that failure silent (operator
  // eyeballs the map instead — see README).
  it("onTileError is a no-op (not the TileLayer default console.error)", () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const layer = makeBasemapLayer("mykey", "satellite");
    expect(() => layer.props.onTileError(new Error("boom"))).not.toThrow();
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it("shadowEnabled false, pickable false, parameters.depthWriteEnabled false", () => {
    const layer = makeBasemapLayer("mykey", "satellite");
    expect(layer.props.shadowEnabled).toBe(false);
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.parameters).toEqual({ depthWriteEnabled: false });
  });

  describe("renderSubLayers", () => {
    it("returns a BitmapLayer built from the tile's boundingBox and image data", () => {
      const layer = makeBasemapLayer("mykey", "satellite");
      const fakeImage = { width: 256, height: 256 };
      const subProps = {
        id: "basemap-tile-1-2-3",
        data: fakeImage,
        tile: {
          boundingBox: [
            [125.9, 35.7],
            [126.1, 35.9],
          ],
        },
      };
      // @ts-expect-error — minimal renderSubLayers props stub for this unit test.
      const sub = layer.props.renderSubLayers(subProps) as BitmapLayer;
      expect(sub).not.toBeNull();
      // We pass `data: undefined` (BitmapLayer draws from `image`, not
      // `data`), but deck.gl's own Layer base class special-cases the `data`
      // prop (layer.js: `data: {type: 'data', value: EMPTY_ARRAY, ...}`) and
      // normalizes a null/undefined value to `[]` — confirmed against the
      // installed source, not a bug in this factory.
      expect(sub!.props.data).toEqual([]);
      expect(sub!.props.image).toBe(fakeImage);
      expect(sub!.props.bounds).toEqual([125.9, 35.7, 126.1, 35.9]);
    });

    // Spec §2: only the `Base` road map is desaturated (0.5) — it's a busy
    // yellow-highway routing style that would fight the pastel blocks; the
    // satellite photo keeps its color and is lightened by the wash instead.
    it("desaturates the road map while retaining satellite colors", () => {
      const fakeTile = {
        tile: { boundingBox: [[126, 35], [127, 36]] },
        data: {} as ImageBitmap,
        id: "t",
      };
      const sat = makeBasemapLayer("k", "satellite").props.renderSubLayers(
        fakeTile as never,
      ) as BitmapLayer;
      const base = makeBasemapLayer("k", "base").props.renderSubLayers(
        fakeTile as never,
      ) as BitmapLayer;
      expect(sat.props.desaturate).toBe(0);
      expect(base.props.desaturate).toBe(1);
    });
  });
});

// Task 3 (bright diorama) — the translucent white wash drawn right on top of
// the tiles. BitmapLayer's `tintColor` is multiplicative and can only darken,
// so "brighter satellite" has to be a white polygon over it (spec "검증된 사실").
describe("makeBasemapWashLayer", () => {
  it("is a non-pickable, non-shadow-casting white SolidPolygonLayer (one fixed oversized rectangle)", () => {
    const layer = makeBasemapWashLayer("satellite");
    expect(layer).toBeInstanceOf(SolidPolygonLayer);
    expect(layer.props.id).toBe("basemap-wash");
    expect(layer.props.pickable).toBe(false);
    expect(layer.props.shadowEnabled).toBe(false);
    expect(layer.props.extruded).toBe(false);
    expect(layer.props.parameters).toMatchObject({ depthWriteEnabled: false });
    expect(layer.props.getFillColor).toEqual([8, 20, 33, 158]);
  });

  it("uses a lighter wash for the base map", () => {
    expect(makeBasemapWashLayer("base").props.getFillColor).toEqual([8, 20, 33, 182]);
    expect(makeBasemapWashLayer("night").props.getFillColor).toEqual([8, 20, 33, 210]);
  });

  // Task 3 fix round 1 (review ruling) — the wash is ONE fixed oversized
  // rectangle, not the basemap extent (or a padded version of it):
  // TileLayer's `extent` only decides WHICH tiles load, a tile straddling
  // the edge is still drawn whole, so any wash cut near the extent leaves a
  // visible unwashed band / brightness edge. `[120,30]–[135,41]` is larger
  // than any area the camera can ever show (see the coverage comment in basemapLayer.ts: MapController keeps the camera inside maxBounds, worst settled view lng 124.1–130.2 / lat 34.5–39.2), so no edge of it is ever on screen. Pinned as a literal — it is
  // deliberately NOT derived from CONTROLLER.maxBounds or the tile zoom.
  it("is one fixed closed ring [120,30]–[135,41], larger than anything the viewport can reach", () => {
    const data = makeBasemapWashLayer("satellite").props.data as { polygon: number[][] }[];
    expect(data).toHaveLength(1);
    const [d] = data;
    expect(d.polygon).toEqual([
      [120, 30],
      [135, 30],
      [135, 41],
      [120, 41],
      [120, 30],
    ]);
    expect(d.polygon).toHaveLength(5);
    expect(d.polygon[4]).toEqual(d.polygon[0]);
    // …and it strictly contains the tile extent (CONTROLLER.maxBounds) with
    // room to spare on every side, so tiles spilling past the extent are
    // still under the wash.
    const [[w, s], [e, n]] = CONTROLLER.maxBounds;
    expect(w).toBeGreaterThan(120);
    expect(s).toBeGreaterThan(30);
    expect(e).toBeLessThan(135);
    expect(n).toBeLessThan(41);
    // getPolygon reads the same ring back (accessor, not a fixed literal).
    // Cast through unknown: deck.gl's AccessorFunction takes a second
    // `objectInfo` argument this unit test doesn't need to supply.
    const getPolygon = makeBasemapWashLayer("satellite").props.getPolygon as unknown as (
      x: { polygon: number[][] },
    ) => number[][];
    expect(getPolygon(d)).toBe(d.polygon);
  });
});
