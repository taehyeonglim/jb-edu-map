import { ColumnLayer, TextLayer } from "@deck.gl/layers";
import type { PickingInfo } from "@deck.gl/core";
import {
  CollisionFilterExtension,
  type CollisionFilterExtensionProps,
} from "@deck.gl/extensions";

import { SCHOOL_LEVEL_COLORS } from "@/lib/schoolVisuals";
import { REGION_MATERIAL } from "@/components/map/lighting";
import type { School } from "@/lib/schools/types";

// Task B — module-scope constant, same reasoning as labelLayer.ts's own
// COLLISION_FILTER_EXTENSION (a fresh instance every render would be
// equally correct — LayerExtension.equals() treats any two no-opts
// instances as equal — this just skips the pointless per-render alloc). A
// SEPARATE instance from labelLayer.ts's, deliberately: nothing shares
// state through it (CollisionFilterExtension carries none — collisionGroup/
// collisionTestProps/getCollisionPriority all live on the LAYER, not the
// extension), so a second instance costs nothing and keeps this module
// independent of labelLayer.ts.
const COLLISION_FILTER_EXTENSION = new CollisionFilterExtension();

/**
 * Task D, fix round 1 — school-labels now share region-labels' own
 * `collisionGroup: 'labels'` (previously a separate `'school-labels'` group
 * — see makeSchoolLabelsLayer below). Review finding: with two SEPARATE
 * collision groups, CollisionFilterExtension buckets each group into its
 * own collision FBO (installed @deck.gl/extensions' collision-filter-
 * effect.js) — region-labels and school-labels never arbitrated against
 * each other AT ALL, so whichever layer happened to be pushed later into
 * `layers` (school-labels — DeckMap.tsx) simply painted over the other
 * regardless of priority (both also had `depthCompare: 'always'`, so
 * nothing else stopped it either): the "전주시 70,444" region chip was being
 * painted over by ordinary school-name chips even though it should always
 * win. Sharing one group means school priorities must now also be compared
 * against REGION-label priorities (labelLayer.ts's `priorityOf`/selected-
 * region-1000), not just against each other — a school chip must NEVER
 * outrank (and so must never hide) a 시군 chip, selected or not.
 * DeckMap.tsx's region-label priority range is [-15, 1000] (unselected:
 * -1..-14 by rank, or -15 with no data at all; selected: flat 1000 — see
 * labelLayer.ts's `getCollisionPriority`). Mapping a school's raw student
 * count to [-1000, -100] — strictly below every possible region-label
 * priority — keeps "more students -> higher priority" WITHIN schools (a
 * bigger school's name still wins over a smaller one nearby) while a
 * school can never outrank any region chip.
 *
 * Still clamped into CollisionFilterExtension's documented safe range for
 * `getCollisionPriority` ("Must return a number in the range -1000 -> 1000"
 * — installed @deck.gl/extensions' collision-filter-extension.d.ts): the
 * installed collision shader (shader-module.js) enforces this literally —
 * `position.z = -0.001 * collisionPriority * position.w` is a CLIP-SPACE z,
 * so a priority outside ±1000 pushes a label's entire quad past a clip
 * plane during the collision pass, and the GPU discards it outright, making
 * that label invisible FOREVER (not merely de-prioritized). Real data has
 * schools above 900 학생 (max 1607, 군산금빛초등학교) — clamping the raw
 * student count at 900 (not 1000) BEFORE the `-1000` shift below keeps
 * every mapped priority safely inside [-1000, -100], never touching the
 * shader's -1000 boundary itself. See task-B-report.md (the original
 * clamp/range) and task-D-report.md, "Fix round 1" (the shared-group range
 * shift below -15).
 */
const MAX_SCHOOL_STUDENTS_FOR_PRIORITY = 900;
/** Maps a school's raw student count to [-1000, -100] — see this function's own doc comment above for why both the clamp and the -1000 shift exist. */
function schoolCollisionPriority(students: number | null): number {
  return Math.min(students ?? 0, MAX_SCHOOL_STUDENTS_FOR_PRIORITY) - 1000;
}

/** Default deck.gl `transitions` duration (ms) — see each factory's `transitionDuration` option. */
const DEFAULT_TRANSITION_DURATION = 600;

// Task D — 학교 기둥: fixed visual constants for EVERY school column,
// regardless of student count (only height — makeSchoolHeightScale in
// schoolVisuals.ts — encodes the count; radius/resolution/highlight color
// are the same for every column, the same way makeRegionsLayer's
// highlightColor is a single constant, not per-feature).
const COLUMN_RADIUS_PX = 4;
const COLUMN_DISK_RESOLUTION = 10;
// 밝은 디오라마 (spec §5) — hover/selection darkens the column (black @ 70/255)
// instead of the dark theme's white wash, which a light scene would swallow.
const HIGHLIGHT_COLOR: [number, number, number, number] = [0, 0, 0, 70];

/** A school with a real location match (see fix-round-1: a 특수학교 row has `lat`/`lng: null` and can never be plotted). */
export type PositionedSchool = School & { lat: number; lng: number };

/**
 * Type guard for a school with a real coordinate. fix-round-2 (review
 * finding #1): this used to be a `withCoordinates()` HELPER that both layer
 * factories called on every invocation, re-filtering (and re-allocating a
 * brand-new array) each time — even when the input hadn't changed at all.
 * Since both factories are built inside DeckMap's `layers` useMemo (whose
 * deps include highlightedSchoolId/handleSchoolClick), that meant every
 * highlight click handed deck.gl a new `data` array identity, which deck.gl
 * treats as "the whole dataset changed" (`invalidateAll()`), defeating the
 * layers' own scoped `updateTriggers` (getLineColor/getLineWidth only).
 * DeckMap.tsx now calls this predicate itself, ONCE, inside its own
 * `useMemo(() => regionSchools.filter(hasCoordinates), [regionSchools])` —
 * that array's identity (and therefore both layers' `data` identity, since
 * they're both handed this SAME array) only changes when the selected
 * region's school set actually changes, never on a highlight-only
 * re-render. See `tests/unit/schoolLayers.test.ts`'s "data reference
 * stability" describe block.
 */
export function hasCoordinates(school: School): school is PositionedSchool {
  return school.lat !== null && school.lng !== null;
}

export interface SchoolsLayerOptions {
  /** Same injection point as makeRegionsLayer's elevationOf — schools sit on their region's top face. */
  elevationOf: (regionCode: string) => number;
  /** students -> column height(m), pre-scaled over the FULL schools.json list (see makeSchoolHeightScale) so column heights don't rescale when the selected 시군 changes. */
  heightOf: (students: number | null) => number;
  /** Stable identity for `heightOf`'s domain (e.g. `bundle.schools.referenceDate.stats`) — included in `updateTriggers.getElevation` so a dataset refresh re-evaluates height. In practice `heightOf` only changes when `bundle.schools` itself changes, which also changes `data`'s own reference (deck.gl already regenerates every attribute from scratch on a new `data` reference) — this trigger is a defensive belt-and-suspenders measure, not something that fires in normal use. */
  heightKey: string | number;
  /** The currently-highlighted school's id (RegionPanel row click / map click), or null/undefined. */
  highlightedId?: string | null;
  visible: boolean;
  onClick?: (id: string) => void;
  /** Included in updateTriggers.getPosition — elevationOf's output depends on the selected indicator, so a school's z coordinate must re-evaluate when it changes (same pattern as makeRegionsLayer's triggerKey). */
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPosition/getElevation. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/**
 * Task D — the 학교 layer: an extruded `ColumnLayer`, one 기둥 (column) per
 * school standing on its region's top face, replacing the old flat
 * `ScatterplotLayer` dot. Only ever fed the selected 시군's schools by the
 * caller (DeckMap); `visible` additionally gates the whole layer (e.g. off
 * entirely when nothing is selected). `schools` must already be
 * pre-filtered to real coordinates (see `hasCoordinates`) — this factory
 * does NOT filter or reallocate `data` itself (fix-round-2, review finding
 * #1: that used to happen here, defeating `data` reference stability across
 * re-renders); the `PositionedSchool[]` parameter type enforces this at
 * compile time, not just by convention. See `tests/unit/schoolLayers.test.ts`.
 *
 * `getPosition`'s z is exactly `elevationOf(regionCode)` — the column's
 * BASE, not its center: verified directly against the installed
 * `@deck.gl/layers`' column-geometry.ts (the static template mesh spans
 * local z [-1, +1]) and column-layer-vertex.glsl.ts
 * (`elevation = instanceElevations * (positions.z + 1.0) / 2.0 * ...`,
 * ADDED to `instancePositions.z`) — local z=-1 (the column's un-capped
 * bottom edge) contributes 0 elevation, so the rendered base sits exactly
 * at `getPosition`'s z, and local z=+1 (the capped top) contributes the
 * full `getElevation(d)` value. No bottom cap is ever tessellated (only a
 * side wall + a top cap — see column-geometry.ts), so there's no coincident
 * filled surface at the base to z-fight the region's own top face.
 *
 * Highlight is `highlightedObjectIndex` + `highlightColor` (deck.gl's own
 * picking-based recolor), not a custom stroke: an extruded column's
 * `stroked` prop only affects ColumnLayer's FLAT/non-extruded disk mode
 * (confirmed against the installed shader: the stroke branch is
 * `else if (column.stroked)`, mutually exclusive with the `extruded`
 * branch), so the old getLineColor/getLineWidth toggle has no extruded
 * equivalent to move to.
 */
export function makeSchoolsLayer(
  schools: PositionedSchool[],
  opts: SchoolsLayerOptions,
) {
  const highlightedId = opts.highlightedId ?? null;
  const transitionDuration =
    opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;
  // `null`, not -1, when nothing is highlighted (or the highlighted id
  // isn't in `data` at all): deck.gl's own `updateAutoHighlight` (installed
  // @deck.gl/core's layer.ts:1306) only runs the hover-highlight path
  // `if (autoHighlight && !Number.isInteger(highlightedObjectIndex))` —
  // since `Number.isInteger(-1) === true`, passing
  // `Array.prototype.findIndex`'s raw not-found sentinel (-1) would
  // permanently defeat `autoHighlight: true` below (hover would never
  // highlight anything, for the life of the layer) even though both
  // `autoHighlight` and a non-default `highlightColor` are explicitly
  // configured. `null` is deck.gl's own documented "nothing explicitly
  // highlighted" default and keeps hover working; verified directly
  // against the installed source.
  const foundIndex = schools.findIndex((s) => s.id === highlightedId);
  const highlightedObjectIndex = foundIndex >= 0 ? foundIndex : null;

  return new ColumnLayer<PositionedSchool>({
    id: "schools",
    data: schools,
    visible: opts.visible,
    pickable: true,
    autoHighlight: true,
    highlightColor: HIGHLIGHT_COLOR,
    highlightedObjectIndex,
    radiusUnits: "pixels",
    radius: COLUMN_RADIUS_PX,
    diskResolution: COLUMN_DISK_RESOLUTION,
    extruded: true,
    flatShading: true,
    material: REGION_MATERIAL,
    getPosition: (d): [number, number, number] => [
      d.lng,
      d.lat,
      opts.elevationOf(d.regionCode),
    ],
    getElevation: (d) => opts.heightOf(d.students),
    getFillColor: (d) => SCHOOL_LEVEL_COLORS[d.level],
    // Task D — NO `parameters` override (the old ScatterplotLayer's
    // `depthCompare: 'always'` is REMOVED here): a flat point marker needed
    // to always draw on top regardless of what's behind it, but a real,
    // extruded 3D column is the opposite — it must be depth-tested normally
    // against every other column/region so nearer geometry correctly
    // occludes farther geometry. Leaving `parameters` unset keeps deck.gl's
    // own default (depth test+write both on), same as makeRegionsLayer's
    // extruded body. Shadow casting is also left at its default (ON) —
    // unlike the labels (school-labels/region-labels/region-top-rings),
    // this layer has no `shadowEnabled: false` — a column casts a shadow
    // onto its region's top face, same as the region body itself.
    updateTriggers: {
      getPosition: [opts.triggerKey],
      getElevation: [opts.heightKey],
    },
    // Omitted when 0 — see labelLayer.ts (collision FBO re-render per frame
    // while any layer carries a truthy `transitions`).
    transitions:
      transitionDuration > 0
        ? { getPosition: transitionDuration, getElevation: transitionDuration }
        : undefined,
    onClick: opts.onClick
      ? (info: PickingInfo<PositionedSchool>) => {
          if (info.object) opts.onClick?.(info.object.id);
        }
      : undefined,
  });
}

export interface SchoolLabelsLayerOptions {
  collisionEnabled?: boolean;
  highlightedId?: string | null;
  elevationOf: (regionCode: string) => number;
  /** students -> column height(m) — the SAME accessor DeckMap hands makeSchoolsLayer (see its own doc comment), used by legacy columns; the live school map passes zero. */
  heightOf: (students: number | null) => number;
  /** Same as makeSchoolsLayer's heightKey — included in updateTriggers.getPosition since z now depends on heightOf too. */
  heightKey: string | number;
  /** Computed by the caller as `!!selectedCode && zoom >= 10` (see DeckMap.tsx's SCHOOL_LABEL_MIN_ZOOM, Task B: 11 -> 10) — this layer has no zoom/selection awareness of its own. */
  visible: boolean;
  fontFamily: string;
  characterSet: string[];
  triggerKey: string | number;
  /** deck.gl `transitions` duration (ms) for getPosition. Defaults to 600. Task 6, Section A.4 — pass 0 when `prefers-reduced-motion: reduce`. */
  transitionDuration?: number;
}

/** Fixed-size names for positioned schools; callers can resolve collisions in screen space. */
export function makeSchoolLabelsLayer(
  schools: PositionedSchool[],
  opts: SchoolLabelsLayerOptions,
) {
  const transitionDuration =
    opts.transitionDuration ?? DEFAULT_TRANSITION_DURATION;

  return new TextLayer<
    PositionedSchool,
    CollisionFilterExtensionProps<PositionedSchool>
  >({
    id: "school-labels",
    data: schools,
    visible: opts.visible,
    // Zero-height accessors anchor the live map to ground, without column clearance.
    getPosition: (d): [number, number, number] => [
      d.lng,
      d.lat,
      opts.elevationOf(d.regionCode) + opts.heightOf(d.students),
    ],
    getText: (d) => d.name,
    sizeUnits: "pixels",
    getSize: 11,
    sizeMinPixels: 11,
    sizeMaxPixels: 11,
    getPixelOffset: [0, -8],
    billboard: true,
    getAlignmentBaseline: "bottom",
    fontFamily: opts.fontFamily,
    fontWeight: 500,
    characterSet: opts.characterSet,
    fontSettings: { sdf: true, fontSize: 48 },
    // 밝은 디오라마 (spec §5) — same white-chip/ink-text/white-outline colors
    // as region-labels (labelLayer.ts).
    outlineWidth: 0.15,
      outlineColor: [18, 36, 56, 255],
      getColor: [235, 245, 252, 255],
    // Task B — 칩 배경은 더 작게: same chip palette as region-labels
    // (labelLayer.ts), tighter padding/radius for the smaller (11px)
    // school-name text.
    background: true,
      getBackgroundColor: [18, 36, 56, 235],
    backgroundPadding: [4, 2],
    backgroundBorderRadius: 4,
    // Task D, fix round 1 — CollisionFilterExtension: `collisionGroup:
    // 'labels'` — the SAME group region-labels uses (labelLayer.ts), not a
    // separate 'school-labels' group anymore. See schoolCollisionPriority's
    // doc comment above for why the separate-group setup was actually the
    // root cause of a real bug (a region chip getting painted over by
    // school chips). `collisionTestProps: { sizeScale: 1.6 }` stays a
    // PER-LAYER override even in a shared group — confirmed against the
    // installed collision-filter-extension.ts: `initializeState` does
    // `this.props = this.clone(this.props.collisionTestProps).props`,
    // applied to each layer's OWN props independently of which group it's
    // in — so school-labels can still test collisions against a bigger
    // hitbox multiplier (1.6, vs region-labels' 1.3 — school names sit much
    // closer together on screen once zoomed in) while sharing one arbitration
    // budget/FBO with region-labels.
    // getCollisionPriority = 학생수 (schoolCollisionPriority, now shifted
    // into [-1000,-100] — see its own doc comment above for why). No
    // `updateTriggers.getCollisionPriority` entry: unlike region-labels'
    // priority (which closes over `selectedCode`, state EXTERNAL to any one
    // datum), this reads only `d.students` — deck.gl already re-evaluates
    // every accessor whenever `data`'s reference changes (a new selected
    // region), which is the only way a school's own student count could
    // ever change here.
    extensions: [
      ...(opts.collisionEnabled === false ? [] : [COLLISION_FILTER_EXTENSION]),
    ],
    collisionEnabled: opts.collisionEnabled ?? true,
    collisionGroup: "labels",
    collisionTestProps: {
      sizeScale: 1.6,
      getPixelOffset: [0, 0],
      getAlignmentBaseline: "center",
    },
    getCollisionPriority: (d: PositionedSchool) =>
      d.id === opts.highlightedId ? -1 : schoolCollisionPriority(d.students),
    parameters: { depthCompare: "always", depthWriteEnabled: false },
    // Task A — 그림자 캐스팅 제외: same reasoning as labelLayer.ts's
    // region-labels — an outer `shadowEnabled` prop never reaches TextLayer's
    // leaf sub-layers (MultiIconLayer `characters`, TextBackgroundLayer
    // `background`), which is what deck.gl's shadow pass actually checks.
    _subLayerProps: {
      characters: { shadowEnabled: false },
      background: { shadowEnabled: false },
    },
    updateTriggers: {
      getCollisionPriority: [opts.highlightedId],
      getPosition: [opts.triggerKey, opts.heightKey],
      getText: [opts.triggerKey],
    },
    // Omitted when 0 — see labelLayer.ts.
    transitions:
      transitionDuration > 0 ? { getPosition: transitionDuration } : undefined,
  });
}
