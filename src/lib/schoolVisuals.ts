/**
 * Pure school-layer visual encoding: per-학교급 colors/labels and the
 * student-count -> column-height scale. No deck.gl import (deck.gl imports
 * are scoped to src/components/map/** per the task brief) — both
 * src/components/map/layers/schoolLayers.ts (the deck.gl layer) and
 * src/components/panels/Legend.tsx (a plain React panel, no deck.gl) import
 * colors from here, so the legend's swatches and the map's columns can never
 * drift apart.
 */
import type { SchoolLevel } from "./indicators/types";
import type { School } from "./schools/types";

export type RGBA = [number, number, number, number];

/**
 * 학교급별 4색 — distinct hue AND lightness steps, not just hue (colorblind-
 * safe), and deep/saturated enough to read as a column against this app's
 * light pastel top faces and paper backdrop (밝은 디오라마, 2026-09-21 spec
 * §5). The dark theme's lighter set (#4cc9f0/#f9c74f/#f3722c/#b5e48c) sank
 * into a cream/mint top face; these are the same four hues, deepened.
 */
export const SCHOOL_LEVEL_COLORS: Record<SchoolLevel, RGBA> = {
  elem: [67, 207, 224, 255],
  mid: [242, 184, 92, 255],
  high: [242, 140, 98, 255],
  special: [130, 226, 199, 255],
};

export const SCHOOL_LEVEL_ORDER: SchoolLevel[] = ["elem", "mid", "high", "special"];

export const SCHOOL_LEVEL_LABELS: Record<SchoolLevel, string> = {
  elem: "초",
  mid: "중",
  high: "고",
  special: "특수",
};

export const SCHOOL_HEIGHT_MIN_M = 150;
export const SCHOOL_HEIGHT_MAX_M = 1400;

/**
 * Builds a `students -> column height(m)` accessor by linearly mapping
 * sqrt(students) across the FULL given school list's own [min, max] onto
 * [SCHOOL_HEIGHT_MIN_M, SCHOOL_HEIGHT_MAX_M]. `null` (no student count)
 * always maps to the minimum height.
 *
 * Task D — replaces the old students->radius(px) scale
 * (`makeSchoolRadiusScale`) now that the schools layer is a `ColumnLayer`
 * (height-encoded) rather than a flat `ScatterplotLayer` (radius-encoded);
 * same sqrt/clamp shape, only the output range/units differ.
 * `SCHOOL_HEIGHT_MAX_M` doubles as the region-label z-clearance constant
 * (`labelLayer.ts`'s `makeRegionLabelLayer`) — the selected region's own
 * label must clear the tallest a column can EVER get, which is exactly this
 * scale's max, so both stay in lockstep from one source of truth.
 *
 * Deliberately takes the *entire* schools.json list, not whatever subset is
 * currently being rendered (e.g. just the selected 시군): the height scale's
 * domain must stay fixed across a region selection change, or a column's
 * height would silently mean something different every time the user picks
 * a new 시군 (e.g. the same 300-student school reading as "tall" in a region
 * full of tiny rural schools but "short" next to 전주시's biggest). Callers
 * compute this once from the full bundle and reuse the same accessor for
 * whatever filtered subset they actually hand to the layer.
 */
export function makeSchoolHeightScale(schools: readonly Pick<School, "students">[]): (students: number | null) => number {
  const sqrtValues = schools
    .map((s) => s.students)
    .filter((v): v is number => v != null && v >= 0)
    .map((v) => Math.sqrt(v));

  if (sqrtValues.length === 0) {
    return () => SCHOOL_HEIGHT_MIN_M;
  }

  const min = Math.min(...sqrtValues);
  const max = Math.max(...sqrtValues);

  return (students: number | null): number => {
    if (students == null || students < 0) return SCHOOL_HEIGHT_MIN_M;
    if (max === min) return (SCHOOL_HEIGHT_MIN_M + SCHOOL_HEIGHT_MAX_M) / 2;
    const t = (Math.sqrt(students) - min) / (max - min);
    const clamped = Math.min(1, Math.max(0, t));
    return SCHOOL_HEIGHT_MIN_M + (SCHOOL_HEIGHT_MAX_M - SCHOOL_HEIGHT_MIN_M) * clamped;
  };
}
