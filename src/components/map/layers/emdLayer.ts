import { PathLayer } from "@deck.gl/layers";
import type { Feature, FeatureCollection, MultiPolygon, Polygon, Position } from "geojson";

/** `[lng, lat, elevation]` path point, as consumed by PathLayer's default (identity) coordinate format — same shape as regionLayers.ts's own Point3. */
type Point3 = [number, number, number];
type RGBA = [number, number, number, number];

const DEFAULT_TRANSITION_DURATION = 600;

export interface EmdPathDatum {
  path: [number, number][];
}

function toLngLat(position: Position): [number, number] {
  return [position[0], position[1]];
}

/** Every ring (outer + holes) of every Polygon/MultiPolygon feature in `fc`, flattened to `{path}` data — no per-ring `code`/`name` carried through, unlike regionLayers.ts's ringsOf/RegionTopRingDatum, since every ring in this layer renders identically (no per-region selected-state distinction; only ONE 시군's 읍면동 boundaries are ever shown at a time). */
function flattenEmdRings(fc: FeatureCollection): EmdPathDatum[] {
  const data: EmdPathDatum[] = [];
  for (const feature of fc.features as Feature<Polygon | MultiPolygon, unknown>[]) {
    const { geometry } = feature;
    if (!geometry) continue;
    if (geometry.type === "Polygon") {
      for (const ring of geometry.coordinates) {
        data.push({ path: ring.map(toLngLat) });
      }
    } else if (geometry.type === "MultiPolygon") {
      for (const part of geometry.coordinates) {
        for (const ring of part) {
          data.push({ path: ring.map(toLngLat) });
        }
      }
    }
  }
  return data;
}

// Module-scope cache keyed by FeatureCollection object IDENTITY (a WeakMap,
// so an abandoned fc's entry is garbage-collected along with it — no manual
// eviction needed, same reasoning as useEmdBoundaries.ts's own module-scope
// fetch cache). `makeEmdBoundaryLayer` is called fresh on every DeckMap
// `layers` recompute (indicator switch, school highlight, ...), same as
// every other `make*Layer` factory in this codebase — but the
// useEmdBoundaries hook only ever returns a NEW `fc` object when a genuinely
// different 시군's fetch resolves, so keying the flattened-data cache on
// THAT reference (rather than recomputing on every call) keeps the
// PathLayer's `data` prop referentially stable across every re-render that
// doesn't actually change which 시군's boundaries are showing — the task
// brief's "훅 결과가 바뀔 때만 useMemo 로 1회 생성(참조 고정)" requirement.
// Without this, deck.gl would re-tessellate this layer's buffers on every
// unrelated re-render (e.g. switching indicators while the same 시군 stays
// selected).
const flattenedCache = new WeakMap<FeatureCollection, EmdPathDatum[]>();

function flattenEmdRingsCached(fc: FeatureCollection): EmdPathDatum[] {
  const cached = flattenedCache.get(fc);
  if (cached) return cached;
  const data = flattenEmdRings(fc);
  flattenedCache.set(fc, data);
  return data;
}

export interface EmdBoundaryLayerOptions {
  /**
   * The SELECTED 시군's own bar height (m) — a single number, unlike
   * regionLayers.ts's makeRegionTopRingsLayer (which draws a ring for all 14
   * 시군 at once and needs a per-region `elevationOf`): this layer only ever
   * renders ONE 시군's 읍면동 boundaries (the currently-selected one) at a
   * time, so its caller (DeckMap) just hands in `elevationOf(selectedCode)`
   * directly.
   */
  elevation: number;
  /** Included in `updateTriggers.getPath` alongside `elevation` itself (per the task brief) — re-evaluates getPath's z when either changes, matching this app's other elevation-driven layers' convention. */
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPath. Defaults to 600 — pass 0 when `prefers-reduced-motion: reduce` (Task 6, Section A.4 convention, mirrored from regionLayers.ts/schoolLayers.ts). */
  transitionDuration?: number;
}

/**
 * Task E — a thin outline of every 읍면동 (sub-시군 administrative)
 * boundary within the currently-selected 시군, drawn just above its top face
 * (`elevation + 3` — below region-top-rings' own `elevation + 5` selection
 * ring, so the two never visually fight — see regionLayers.ts's
 * makeRegionTopRingsLayer). Purely a geographic-context outline ("구획선");
 * no labels, not pickable, casts no shadow.
 */
export function makeEmdBoundaryLayer(fc: FeatureCollection, opts: EmdBoundaryLayerOptions) {
  const transitionDuration = opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
  const data = flattenEmdRingsCached(fc);

  return new PathLayer<EmdPathDatum, { shadowEnabled: boolean }>({
    id: "emd-boundaries",
    data,
    getPath: (d): Point3[] => d.path.map(([x, y]) => [x, y, opts.elevation + 3]),
    widthUnits: "pixels",
    getWidth: 1,
    // 밝은 디오라마 (spec §4) — translucent gray on the pastel top face (the
    // dark theme's translucent white would vanish on it).
    getColor: [131, 230, 239, 150] as RGBA,
    jointRounded: true,
    // Same rationale as makeRegionTopRingsLayer's own shadowEnabled: false —
    // not part of PathLayer's public TS prop type (deck.gl's shadow pass
    // reads `layer.props.shadowEnabled` directly off the runtime props
    // object), so the second generic parameter above widens the
    // constructor's expected prop shape to accept it without an `as unknown
    // as ...` escape hatch.
    shadowEnabled: false,
    pickable: false,
    updateTriggers: {
      getPath: [opts.triggerKey, opts.elevation],
    },
    // Omitted when 0 — see regionLayers.ts (collision FBO re-render per frame).
    transitions: transitionDuration > 0 ? { getPath: transitionDuration } : undefined,
  });
}
