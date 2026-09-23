"use client";

import { ACTIVE_PROFILE } from "@/lib/profiles";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { parseAsStringLiteral, useQueryState } from "nuqs";
import {
  schoolChartMetric,
  chartMaximum,
  chartHeight,
  chartValueText,
} from "@/lib/schools/chart";
import { makeSchoolChartLayer } from "./layers/schoolChartLayer";
import {
  makeDensityLayer,
  makeSpecialSchoolLayer,
  supportsDensity,
} from "./layers/metricLayers";
import MetricLegend from "@/components/panels/MetricLegend";
import { buildMapMetric, type MapMetricSpec } from "@/lib/mapMetrics";
import DeckGL from "@deck.gl/react";
import { ScatterplotLayer } from "@deck.gl/layers";
import type { DeckGLRef } from "@deck.gl/react";
import { Deck, MapView, WebMercatorViewport } from "@deck.gl/core";
import type {
  LayersList,
  PickingInfo,
  MapViewState,
  ViewStateChangeParameters,
  Viewport,
} from "@deck.gl/core";
import { DarkGlassTheme, ResetViewWidget, ZoomWidget } from "@deck.gl/widgets";
import "@deck.gl/widgets/stylesheet.css";

import {
  isRegionCode,
  regionName,
  REGION_CODES,
  type RegionCode,
} from "@/lib/geo/regions";
import { declutterLabels, type LabelCandidate } from "./declutterLabels";
import type { EducationIssuesFile, IssueMapModel, IssueResource } from "@/lib/issues/types";
import type { School } from "@/lib/schools/types";
import { readEmdPref, writeEmdPref } from "@/components/map/emdPref";
import { readBasemapPref, writeBasemapPref } from "@/components/map/basemapPref";
import { CONTROLLER, VIEW_LIMITS } from "@/components/map/camera";
import { makeBuildingLayer } from "./layers/buildingLayer";
import { buildingsActive, scenePitch } from "./scene";
import { useScene } from "./useScene";
import {
  makeBasemapWashLayer,
  makeBasemapLayer,
} from "@/components/map/layers/basemapLayer";
import { makeEmdBoundaryLayer } from "@/components/map/layers/emdLayer";
import { makeRegionLabelLayer } from "@/components/map/layers/labelLayer";
import {
  hasCoordinates,
  makeSchoolLabelsLayer,
} from "@/components/map/layers/schoolLayers";
import { makeSchoolTooltip, makeTooltip } from "@/components/map/tooltip";
import MapOverlay, { type MapOverlayItem } from "@/components/map/MapOverlay";
import SchoolHud from "@/components/map/SchoolHud";
import { HUD_THEME, THEME } from "@/lib/theme";
import { useHudLayout } from "./useHudLayout";
import { useCamera } from "@/components/map/useCamera";
import { useEmdBoundaries } from "@/components/map/useEmdBoundaries";
import { useFontGate } from "@/components/map/useFontGate";
import { useRegionKeyboardNav } from "@/components/map/useRegionKeyboardNav";
import { useBundle } from "@/lib/data/DataProvider";
import { indicatorById } from "@/lib/indicators/registry";
import {
  collisionPriorityFromRank,
  displayLabel,
  rank,
  valueMap,
} from "@/lib/stats";
import {
  makeLinesOf,
  formatWithUnit,
  schoolTooltipLines,
} from "@/lib/tooltipText";
import { regionRankList, selectionAnnouncement } from "@/lib/selection";
import { useReducedMotion } from "@/lib/useReducedMotion";
import {
  makeFlatRegionsLayer,
  makeFlatSchoolsLayer,
} from "@/components/map/layers/flatMapLayers";

/** School names appear at neighbourhood scale, independently of region selection. */
const SCHOOL_LABEL_MIN_ZOOM = 15;
/** onViewStateChange 스로틀 간격(ms). */
const ZOOM_THROTTLE_MS = 100;

// e2e-only bridge (see e2e/select-region.spec.ts): only ever written when
// NEXT_PUBLIC_E2E=1 (a build-time-inlined env var — see playwright.config.ts's
// webServer.env), never read/written in normal production use.
//
// `events` — CI Linux fix (ci-linux-fixes branch): a small ring of recent
// region-click/pick attempts (handleRegionClick/handleDeckClick below), so
// e2e/select-region.spec.ts's canvas-click test can dump *why* a click
// didn't select a region (never picked at all vs. picked-then-lost) instead
// of only ever seeing the URL's end state.
//
// `selectRegion` — CI Linux fix: exposes handleRegionClick directly. CI runs
// 35542371166 and 35544350592 showed `events` staying completely empty
// (not even a "miss" deck-click) across 6+ synthetic mouse down/up attempts
// spanning 2 separate page loads, even with every readiness gate already
// satisfied — i.e. mjolnir.js's tap gesture recognizer never fires deck.gl's
// onClick at all for the lifetime of some Linux+swiftshader page sessions.
// The canvas-click e2e test uses this to drive the SAME selection codepath
// on Linux CI, so the URL/panel/Esc assertions still exercise the real
// feature there — only the unreliable synthetic gesture is bypassed, never
// the coverage (see the test's own comment for the full reasoning).
declare global {
  interface Window {
    __jbmap?: {
      deck: Deck;
      events?: JbmapEvent[];
      selectRegion?: (code: string) => void;
    };
  }
}

interface JbmapEvent {
  /** "region-click": the regions/region-islands layer's own onClick fired (always a hit, some region code). "deck-click": DeckGL's top-level onClick fired (every click, hit or miss — `picked` distinguishes). */
  type: "region-click" | "deck-click";
  code?: string;
  picked: boolean;
  t: number;
}

const E2E = process.env.NEXT_PUBLIC_E2E === "1";
function recordE2eEvent(event: JbmapEvent) {
  if (!E2E || typeof window === "undefined" || !window.__jbmap) return;
  (window.__jbmap.events ??= []).push(event);
}

// NEXT_PUBLIC_* vars are inlined into the client bundle at build time, so
// this never changes at runtime — no point re-reading it per render. Empty
// string (Next.js's own behavior for an unset NEXT_PUBLIC_* var at runtime,
// vs. simply undefined at build time) is treated the same as "no key" by
// every `VWORLD_KEY &&` gate below.
const VWORLD_KEY = process.env.NEXT_PUBLIC_VWORLD_KEY;

/** Task C — shown under the "배경 지도" MapOverlay control while the basemap is not `off`. No "기준일" word, no date string — those two specifically break e2e/closed-schools.spec.ts's footer-source assertions and tests/components/Footer.test.tsx's 기준일 count (see task-C-brief.md). */
const BASEMAP_ATTRIBUTION = "배경지도 © 국토교통부 브이월드(VWorld)";

function nameOf(code: string): string {
  return isRegionCode(code) ? regionName(code) : code;
}

const VIEW = new MapView();

// 추가 요구 #4: 16px margin (deck.gl/widgets' own default is 12px);
// DarkGlassTheme keeps the 전체보기/줌 buttons consistent with the HUD panels.
// A MODULE constant,
// not an inline object literal inside the component — Task 6, Section C.3
// ("widgetThemeStyle 등 매 렌더 새 객체를 모듈 상수로"): an inline literal would be
// a NEW object reference every render, pointlessly changing the wrapper
// div's `style` prop identity every time.
const WIDGET_THEME_STYLE: CSSProperties = {
  ...DarkGlassTheme,
  "--widget-margin": "16px",
  "--button-size": "46px",
  "--button-corner-radius": `${HUD_THEME.radius}px`,
  "--button-background": HUD_THEME.panelFill,
  "--button-stroke": HUD_THEME.border,
  "--button-icon-idle": THEME.inkMuted,
  "--button-icon-hover": THEME.accent,
  "--button-shadow": "0 0 18px rgba(67,207,224,.08)",
} as CSSProperties;

export interface DeckMapProps {
  mapMetric?: MapMetricSpec;
  compareCode?: RegionCode | null;
  emphasizeZero?: boolean;
  issueModel?: IssueMapModel | null;
  schoolFacts?: EducationIssuesFile | null;
  schools?: School[];
  schoolFocusNonce?: number;
  statisticsVisible?: boolean;
  interactionBlocked?: boolean;
  indicatorId: string;
  /** Selection truth lives in the URL (useMapQuery().regionCode) — DeckMap only renders/reacts to it. */
  selectedCode: RegionCode | null;
  /** Called with a region code on click/keyboard selection, or null to deselect (Esc / empty-space click). */
  onSelect: (code: RegionCode | null) => void;
  /** The currently-highlighted school (map point click / RegionPanel row click), or null. Task 4B — owned by Dashboard (not the URL), mirrored by RegionPanel's row highlight. */
  highlightedSchoolId: string | null;
  /** Called with a school id to highlight it, or null to clear. DeckMap itself handles the "click the same point again -> clear" toggle before calling this. */
  onHighlightSchool: (id: string | null, origin?: "map") => void;
  onSchoolStatistics?: (code: RegionCode) => void;
}

export default function DeckMap({
  indicatorId,
  selectedCode,
  onSelect,
  highlightedSchoolId,
  onHighlightSchool,
  onSchoolStatistics,
  schools,
  schoolFocusNonce = 0,
  statisticsVisible = false,
  interactionBlocked = false,
  issueModel = null,
  schoolFacts = null,
  mapMetric,
  compareCode = null,
  emphasizeZero = false,
}: DeckMapProps) {
  const bundle = useBundle();
  const [schoolChart, setSchoolChart] = useQueryState(
    "schoolChart",
    parseAsStringLiteral(["auto", "columns", "dots"] as const)
      .withDefault("auto")
      .withOptions({ history: "push", shallow: true }),
  );
  const { scene, setScene, enabled: buildingsEnabled } = useScene();
  const [mobile, setMobile] = useState(
    () => window.matchMedia("(max-width: 767px)").matches,
  );
  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");
    const update = () => setMobile(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  const [buildingErrors, setBuildingErrors] = useState<Set<string>>(
    () => new Set(),
  );
  const [buildingFetchedAt, setBuildingFetchedAt] = useState<string | null>(
    null,
  );
  const [buildingRetry, setBuildingRetry] = useState(0);
  const onBuildingStatus = useCallback(
    (id: string, error: boolean, fetchedAt?: string) => {
      queueMicrotask(() => {
        setBuildingErrors((old) => {
          if (old.has(id) === error) return old;
          const next = new Set(old);
          if (error) next.add(id);
          else next.delete(id);
          return next;
        });
        if (fetchedAt) setBuildingFetchedAt(fetchedAt);
      });
    },
    [],
  );
  const [showSchoolNames, setShowSchoolNames] = useState(true);
  const [settings, setSettings] = useState({ schoolId: highlightedSchoolId, open: false });
  const settingsOpen = settings.schoolId === highlightedSchoolId && settings.open;
  const setSettingsOpen = useCallback((open: boolean) => setSettings({ schoolId: highlightedSchoolId, open }), [highlightedSchoolId]);
  const selectedSchool =
    bundle.schools.schools.find((s) => s.id === highlightedSchoolId) ?? null;
  const containerRef = useRef<HTMLDivElement>(null);
  const hudLayout = useHudLayout(containerRef);
  const deckRef = useRef<DeckGLRef | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const mapReadyRef = useRef(false);
  const lastLabelViewportKey = useRef("");
  const lastLabelUpdateTime = useRef(0);
  const labelUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (labelUpdateTimer.current) clearTimeout(labelUpdateTimer.current);
    },
    [],
  );
  const [labelViewport, setLabelViewport] =
    useState<WebMercatorViewport | null>(null);
  const labelsReadyRef = useRef(false);

  // Task 6, Section A.4 — reduced-motion: zeroes both the camera's
  // transitionDuration (useCamera) and every layer's own `transitions`
  // (regionLayers/labelLayer/schoolLayers' `transitionDuration` option)
  // below, when `prefers-reduced-motion: reduce` is set.
  const reduceMotion = useReducedMotion();
  // Task 6, "현재 코드 상태" — camera state/effects/flyTo live in useCamera
  // now (split out of this file with no intended behavior change); `regions`
  // (not `regionsMain`) is deliberately what's handed in — `properties.bbox`
  // already spans a region's FULL original geometry (mainland + islands), so
  // the camera never clips an island out of frame.
  const { overview, cameraViewState, reselect, rememberViewState } = useCamera(
    containerRef,
    bundle.regions,
    selectedCode,
    reduceMotion,
    selectedSchool,
    schoolFocusNonce,
    scene,
    mobile,
    hudLayout?.insets ?? null,
  );

  // Native context loss is not forwarded to onError by every deck.gl version.
  // Capture on the persistent parent: the canvas is created asynchronously,
  // and webglcontextlost does not bubble. Cleanup also covers Strict Mode.
  const [heatmapSupported, setHeatmapSupported] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const onLost = (event: Event) => {
      event.preventDefault();
      setContextLost(true);
    };
    container.addEventListener("webglcontextlost", onLost, true);
    return () => container.removeEventListener("webglcontextlost", onLost, true);
  }, []);
  const handleDeckError = useCallback((error: Error) => {
    if (error.message.toLowerCase().includes("context")) {
      setContextLost(true);
    } else {
      console.error(error);
    }
  }, []);

  const mapCharset = useMemo(
    () =>
      bundle.charset +
      (issueModel ? issueModel.regions.map((row) => row.text).join("") : ""),
    [bundle.charset, issueModel],
  );
  const { fontReady, fontFamily } = useFontGate(mapCharset);
  // Mirrored into a ref so handleAfterRender (a stable, []-deps callback —
  // see its own comment) can read the LATEST fontReady without itself
  // becoming a new function every time fontReady flips.
  //
  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — MUST be
  // useLayoutEffect, not useEffect: @deck.gl/react's own <DeckGL> forwards
  // the `layers` prop (which depends on `fontReady`, below) to the
  // underlying Deck instance from ITS OWN layout effect (confirmed:
  // node_modules/@deck.gl/react/dist/deckgl.js uses
  // useIsomorphicLayoutEffect/useLayoutEffect). React flushes ALL layout
  // effects for a commit synchronously, in tree order, before the browser
  // can paint or run a requestAnimationFrame callback — so a layout effect
  // here is guaranteed to update fontReadyRef.current no later than
  // DeckGL's own layout effect pushes the labeled `layers` into deck.
  // A plain (passive) useEffect is NOT guaranteed that ordering: passive
  // effects are flushed via a separate, later (MessageChannel-scheduled)
  // pass, leaving a real window where deck.gl's next render frame could
  // fire — and handleAfterRender read fontReadyRef.current as still false
  // — before this ref updates, silently skipping data-labels-ready on the
  // first labeled frame (the same bug class the rest of this file's CI
  // fixes exist to close, just from the other direction).
  const fontReadyRef = useRef(fontReady);
  useLayoutEffect(() => {
    fontReadyRef.current = fontReady;
  }, [fontReady]);

  // Task 4B: current zoom, throttled to ZOOM_THROTTLE_MS via onViewStateChange
  // below — this is the ONLY thing zoom is tracked for (deciding whether
  // 학교명 라벨 should render, SCHOOL_LABEL_MIN_ZOOM). Not routed through
  // cameraViewState/`initialViewState` — DeckGL's view stays uncontrolled;
  // this is a passive read of whatever zoom the user's own pan/scroll
  // produced. Starts at the overview's minZoom (labels are never visible at
  // that zoom anyway) rather than undefined, so the very first render
  // already has a defined, safely-below-threshold value.
  const [zoom, setZoom] = useState<number>(VIEW_LIMITS.minZoom);
  const lastZoomUpdateRef = useRef(0);
  const handleViewStateChange = useCallback(
    <T extends MapViewState>({ viewState }: ViewStateChangeParameters<T>) => {
      viewState = {
        ...viewState,
        bearing: 0,
        pitch: scenePitch(scene, Number(viewState.zoom), mobile),
      };
      rememberViewState(viewState);
      const now = Date.now();
      if (now - lastZoomUpdateRef.current < ZOOM_THROTTLE_MS) return viewState;
      lastZoomUpdateRef.current = now;
      const nextZoom = viewState.zoom;
      if (typeof nextZoom !== "number") return;
      // deck.gl/react's <DeckGL> can invoke onViewStateChange synchronously
      // from within its OWN render/transition tick (e.g. mid-FlyTo, or a
      // canvas drag) — calling setState directly from here occasionally lands
      // while a *different* component (ForwardRef(DeckGLWithRef) itself) is
      // still rendering, which React flags: "Cannot update a component while
      // rendering a different component" (confirmed via a real e2e console-
      // error assertion, not just a lint rule — see e2e/select-region.spec.ts's
      // canvas-click test). Deferring one microtask moves the update outside
      // that synchronous call stack (microtasks run after the current script/
      // render finishes, before the next paint) without adding a
      // human-perceptible delay the way a setTimeout(0) macrotask would.
      queueMicrotask(() => setZoom(nextZoom));
      return viewState;
    },
    [rememberViewState, scene, mobile],
  );

  const def = indicatorById(indicatorId);
  if (!def) {
    throw new Error(`DeckMap: unknown indicatorId "${indicatorId}"`);
  }

  const file = bundle.indicators[indicatorId];
  const map = useMemo(() => valueMap(file), [file]);
  const label = useMemo(
    () => displayLabel(def, bundle.series),
    [def, bundle.series],
  );

  // Rank order for keyboard ←/→ cycling ("현재 순위 순") and, indirectly (via
  // the same pure function), RegionList's render order.
  const orderedCodes = useMemo(
    () =>
      issueModel
        ? issueModel.regions.map((row) => row.code)
        : regionRankList(map),
    [map, issueModel],
  );

  // Task B — region-label collision priority (makeRegionLabelLayer's
  // getCollisionPriority/priorityOf — CollisionFilterExtension): reversed
  // value rank (stats.ts's `rank` — 1 = the single biggest value), so a
  // bigger indicator value wins a label collision over a smaller one; a
  // region with no data (absent from `rank`'s map, which omits nulls
  // entirely) gets the lowest priority of ALL, lower than every real rank.
  // Bounded well within CollisionFilterExtension's documented [-1000, 1000]
  // (at most REGION_CODES.length ranks). Independent of `selectedCode` — the
  // selected region's unconditional top priority (1000) is applied inside
  // makeRegionLabelLayer itself, not here.
  const priorityOf = useMemo(() => {
    const ranks = rank(map);
    // B(b) — the rank -> collision-priority mapping itself now lives in
    // stats.ts as a pure, unit-tested helper (collisionPriorityFromRank);
    // this closure only supplies what's specific to THIS render (the rank
    // lookup + REGION_CODES.length).
    return (code: string): number =>
      collisionPriorityFromRank(ranks.get(code), REGION_CODES.length);
  }, [map]);

  const announcement = useMemo(() => {
    if (!selectedCode) return "선택 해제됨, 전체 보기";
    if (issueModel)
      return `${nameOf(selectedCode)} · ${issueModel.title} · ${issueModel.regions.find((row) => row.code === selectedCode)?.text ?? "자료 없음"}`;
    const value = map.get(selectedCode);
    const r = rank(map).get(selectedCode) ?? null;
    const valueText =
      value === null || value === undefined
        ? "자료 없음"
        : formatWithUnit(def, value);
    return selectionAnnouncement({
      name: nameOf(selectedCode),
      label,
      valueText,
      rank: r,
      total: REGION_CODES.length,
    });
  }, [selectedCode, map, def, label, issueModel]);

  const labelTextOf = useCallback(
    (code: string): string => {
      const name = nameOf(code);
      if (issueModel)
        return `${name}\n${issueModel.regions.find((row) => row.code === code)?.text ?? "자료 없음"}`;
      if (!statisticsVisible) return name;
      const value = map.get(code);
      if (value === null || value === undefined) return `${name}\n자료 없음`;
      return `${name}\n${def.format(value)}`;
    },
    [map, def, statisticsVisible, issueModel],
  );

  // Tooltip line assembly (name / value / rank / vsProvince delta) lives in
  // src/lib/tooltipText.ts (Fix round 1, review finding #1) — pure and unit
  // tested there (tests/unit/tooltipText.test.ts), with zero deck.gl/React
  // dependency. makeLinesOf computes rank(map) once per def/label/map
  // change (not per hover) and returns the (code) => string[] tooltip fn.
  const linesOf = useMemo(
    () =>
      issueModel
        ? (code: string) => [
            nameOf(code),
            issueModel.title,
            issueModel.regions.find((row) => row.code === code)?.text ??
              "자료 없음",
            issueModel.date,
          ]
        : makeLinesOf({ def, label, map }),
    [def, label, map, issueModel],
  );

  // Static across indicator switches — regenerating this array on every
  // indicatorId change would give the label TextLayer a new `data` reference
  // each time, defeating deck.gl's diffing (the constraint the task brief
  // calls out explicitly: "매 렌더 새 배열을 만들지 않는다"). Sourced from
  // regionsMain (Task 6, Section C.2): same properties (code/name/labelPoint)
  // as bundle.regions, one feature per region either way. `labelPoint` is
  // already nudged for the 4 시군 that need it (Task B, fix round 1 —
  // build-regions.ts bakes data/manual/label-offsets.json's pixel nudge
  // into labelPoint itself now, not a separate render-time offset).
  const labels = useMemo(
    () =>
      bundle.regionsMain.features.map((f) => ({
        code: f.properties.code,
        name: f.properties.name,
        position: f.properties.labelPoint,
      })),
    [bundle.regionsMain],
  );

  const characterSet = useMemo(
    () => Array.from(new Set(mapCharset)),
    [mapCharset],
  );

  const views = useMemo(() => VIEW, []);

  const positionedSchools = useMemo(
    () => (schools ?? bundle.schools.schools).filter(hasCoordinates),
    [schools, bundle.schools],
  );
  const metricModel = useMemo(
    () =>
      mapMetric ?? buildMapMetric(bundle, indicatorId, issueModel, schoolFacts),
    [mapMetric, bundle, indicatorId, issueModel, schoolFacts],
  );
  const densityVisible =
    schoolChart === "auto" &&
    metricModel.kind === "density" &&
    zoom < 13 &&
    heatmapSupported;
  const chartMetric = useMemo(
    () => schoolChartMetric(indicatorId, issueModel?.metric, schoolFacts),
    [indicatorId, issueModel, schoolFacts],
  );
  const chartMax = useMemo(
    () => (chartMetric ? chartMaximum(bundle.schools.schools, chartMetric) : 0),
    [bundle.schools, chartMetric],
  );
  const columnsVisible =
    scene === "city" && schoolChart === "columns" && chartMetric !== null;
  const heightOfSchool = useCallback(
    (school: School) =>
      columnsVisible && chartMetric
        ? chartHeight(
            chartMetric.value(school),
            chartMax,
            zoom,
            chartMetric.heightMode,
          )
        : 0,
    [columnsVisible, chartMetric, chartMax, zoom],
  );
  const schoolLabelsVisible =
    showSchoolNames && (zoom >= SCHOOL_LABEL_MIN_ZOOM || !!highlightedSchoolId);
  const schoolHudLabel = useCallback(
    (school: School) => `${school.name}\n학생 ${school.students === null ? "자료 없음" : `${school.students.toLocaleString("ko-KR")}명`}`,
    [],
  );
  const handleSchoolClick = useCallback(
    (id: string) => { setSettingsOpen(false); onHighlightSchool(id, "map"); },
    [onHighlightSchool, setSettingsOpen],
  );

  const nearbySchoolId = useCallback((x: number, y: number, viewport?: Viewport) => {
    if (!viewport) return null;
    const radius = mobile ? 14 : 9;
    let closest: { id: string; distance: number } | null = null;
    for (const school of positionedSchools) {
      const [schoolX, schoolY] = viewport.project([school.lng, school.lat]);
      const distance = Math.hypot(schoolX - x, schoolY - y);
      if (distance <= radius && (!closest || distance < closest.distance)) {
        closest = { id: school.id, distance };
      }
    }
    return closest?.id ?? null;
  }, [mobile, positionedSchools]);

  const visibleLabels = useMemo(() => {
    if (!labelViewport || !fontReady)
      return { schools: positionedSchools, regions: labels };
    type Entry =
      | { kind: "school"; value: (typeof positionedSchools)[number] }
      | { kind: "region"; value: (typeof labels)[number] };
    const candidates: LabelCandidate<Entry>[] = labels.map((value) => ({
      value: { kind: "region", value },
      position: value.position,
      text: labelTextOf(value.code),
      size: 14,
      priority: value.code === selectedCode ? 900 : 800,
    }));
    if (schoolLabelsVisible)
      for (const value of positionedSchools.filter(
        (s) => zoom >= SCHOOL_LABEL_MIN_ZOOM || s.id === highlightedSchoolId,
      ))
        candidates.push({
          value: { kind: "school", value },
          position: [value.lng, value.lat, heightOfSchool(value)],
          text: schoolHudLabel(value),
          size: 11,
          priority:
            value.id === highlightedSchoolId
              ? 1000
              : Math.min(700, (value.students ?? 0) / 10),
        });
    const context = document.createElement("canvas").getContext("2d");
    const placed = declutterLabels(candidates, labelViewport, (text, size) => {
      if (!context) return text.length * size;
      context.font = `600 ${size}px ${fontFamily}`;
      return context.measureText(text).width;
    });
    return {
      schools: placed.flatMap((entry) =>
        entry.kind === "school" ? [entry.value] : [],
      ),
      regions: placed.flatMap((entry) =>
        entry.kind === "region" ? [entry.value] : [],
      ),
    };
  }, [
    labelViewport,
    fontReady,
    positionedSchools,
    labels,
    labelTextOf,
    fontFamily,
    selectedCode,
    highlightedSchoolId,
    schoolLabelsVisible,
    schoolHudLabel,
    zoom,
    heightOfSchool,
  ]);

  const getRegionTooltip = useMemo(() => makeTooltip(linesOf), [linesOf]);
  const getSchoolTooltip = useMemo(
    () =>
      makeSchoolTooltip((school) => [
        ...schoolTooltipLines(school),
        ...(chartMetric
          ? [
              `${chartMetric.label}: ${chartValueText(chartMetric.value(school), chartMetric.unit)}`,
            ]
          : []),
      ]),
    [chartMetric],
  );
  // School dots have plain School objects; boundaries have GeoJSON properties.
  const getTooltip = useCallback(
    (info: Parameters<typeof getRegionTooltip>[0]) =>
      info.layer?.id === "issue-resources"
        ? info.object ? { text: `${(info.object as IssueResource).name}\n${(info.object as IssueResource).address ?? ""}` } : null
      : info.layer?.id?.startsWith("schools") ||
      info.layer?.id === "school-columns"
        ? getSchoolTooltip(info)
        : getRegionTooltip(info),
    [getRegionTooltip, getSchoolTooltip],
  );

  const getCursor = useCallback(
    ({
      isDragging,
      isHovering,
    }: {
      isDragging: boolean;
      isHovering: boolean;
    }) => (isDragging ? "grabbing" : isHovering ? "pointer" : "grab"),
    [],
  );

  // A region was clicked on the canvas (the `regions`/`region-islands`
  // layers' own onClick — see below). Re-clicking the ALREADY-selected
  // region wouldn't change the URL (setRegion would push the same value
  // again), so re-fly the camera anyway via useCamera's `reselect` instead
  // of calling onSelect with a no-op value. Every other click is a genuine
  // selection change; onSelect -> the URL -> useCamera's effect drives the
  // camera instead, exactly like a RegionList click would.
  const handleRegionClick = useCallback(
    (code: string, info?: PickingInfo) => {
      // Defensive: makeRegionsLayer's onClick is typed generically (plain
      // string, from GeoJSON feature properties) — every feature in
      // bundle.regions is in fact one of the 14 시군, but this narrows the
      // type rather than assuming it.
      if (!isRegionCode(code)) return;
      // A small school dot sits above the pickable region polygon. When a
      // tap lands a few pixels outside the dot, deck.gl reports the polygon
      // and reselecting that region flies the camera back to its overview.
      // Give the visible school point a forgiving hit area first.
      if (info && (selectedCode !== null || schoolChart !== "auto")) {
        const schoolId = nearbySchoolId(info.x, info.y, info.viewport);
        if (schoolId) {
          handleSchoolClick(schoolId);
          return;
        }
      }
      recordE2eEvent({
        type: "region-click",
        code,
        picked: true,
        t: performance.now(),
      });
      if (code === selectedCode) {
        reselect();
      } else {
        onSelect(code);
      }
    },
    [selectedCode, onSelect, reselect, schoolChart, nearbySchoolId, handleSchoolClick],
  );

  // Mirrored into a ref (same reasoning/pattern as fontReadyRef above) so
  // window.__jbmap.selectRegion, assigned ONCE inside handleAfterRender's
  // one-time block below, can always dispatch to the LATEST
  // handleRegionClick despite being created before this file has any idea
  // what "latest" will eventually mean. Fixes a real bug caught by CI run
  // 35545008220: an EARLIER version of this fix assigned
  // window.__jbmap.selectRegion from its own separate effect, keyed only on
  // [handleRegionClick] — if that effect's FIRST run happened (as it always
  // does, on mount) before handleAfterRender had yet created window.__jbmap
  // at all, and handleRegionClick's identity never changed again
  // afterward, selectRegion was simply never attached — `?.()` on the
  // resulting `undefined` silently no-opped instead of throwing, which is
  // exactly what that run's log showed (the fallback click loop ran, and
  // failed, as if selectRegion had never been called).
  const handleRegionClickRef = useRef(handleRegionClick);
  useLayoutEffect(() => {
    handleRegionClickRef.current = handleRegionClick;
  }, [handleRegionClick]);

  // Top-level DeckGL click: only handles the "missed everything" case (per
  // the task brief: "DeckGL 의 onClick 에서 info.picked === false 면
  // onSelect(null)"). A click that DID pick a region is handled by the
  // `regions`/`region-islands` layers' own onClick (handleRegionClick)
  // instead — deck.gl fires both for the same click, so this only needs the
  // miss branch.
  const handleDeckClick = useCallback(
    (info: PickingInfo) => {
      recordE2eEvent({
        type: "deck-click",
        code: (info.object as { properties?: { code?: string } } | undefined)
          ?.properties?.code,
        picked: info.picked,
        t: performance.now(),
      });
      if (!info.picked) {
        const schoolId = (selectedCode !== null || schoolChart !== "auto")
          ? nearbySchoolId(info.x, info.y, info.viewport)
          : null;
        if (schoolId) handleSchoolClick(schoolId);
        else if (selectedCode !== null) onSelect(null);
      }
    },
    [selectedCode, onSelect, nearbySchoolId, handleSchoolClick, schoolChart],
  );

  // Task 6, "현재 코드 상태" — ←/→/Enter cycling + document-level
  // Escape-to-deselect live in useRegionKeyboardNav now (split out of this
  // file with no intended behavior change).
  const { handleWrapperKeyDown } = useRegionKeyboardNav({
    disabled: interactionBlocked,
    orderedCodes,
    selectedCode,
    onSelect,
    reselect,
    highlightedSchoolId,
    onHighlightSchool,
  });

  // 추가 요구 #4: 전체보기(fit-to-overview) + (나침반은 2026-09-21 북쪽 고정·회전
  // 제거와 함께 삭제 — bearing 이 항상 0 이라 의미가 없다) +
  // (Task A) 줌 버튼, bottom-left inside the canvas. All official deck.gl
  // widgets (already a direct dependency) rather than hand-rolled buttons.
  // ResetViewWidget defaults to `deck.props.initialViewState` when its own
  // `initialViewState` prop is unset — which, once a region is selected,
  // would be the REGION's fit (`cameraViewState`), not the true overview.
  // Passing `overview` explicitly keeps "전체보기" always meaning the
  // overview, regardless of what's currently selected (see task-4A-report.md).
  // ZoomWidget is appended LAST (Task A requirement) — confirmed against
  // e2e/a11y.spec.ts's "전체보기/확대/축소 위젯 버튼이 Tab 으로 도달 가능하다" test
  // that Tab order is unaffected by a widget appended after reset-view in
  // this array.
  const widgets = useMemo(
    () => [
      new ResetViewWidget({
        id: "reset-view",
        placement: "bottom-left",
        label: "전체보기",
        initialViewState: overview ?? undefined,
      }),
      new ZoomWidget({
        id: "zoom",
        placement: "bottom-left",
        zoomInLabel: "확대",
        zoomOutLabel: "축소",
      }),
    ],
    [overview],
  );

  const [emdEnabled, setEmdEnabled] = useState(() => readEmdPref());
  const [basemap, setBasemap] = useState(() => readBasemapPref());
  const handleEmdToggle = useCallback(() => {
    setEmdEnabled((prev) => {
      const next = !prev;
      writeEmdPref(next);
      return next;
    });
  }, []);

  const overlayItems = useMemo<MapOverlayItem[]>(() => {
    const items: MapOverlayItem[] = [];
    if (VWORLD_KEY) items.push({
      kind: "segmented",
      id: "basemap",
      label: "배경 지도",
      value: basemap,
      options: [
        { value: "night", label: "야간" },
        { value: "satellite", label: "위성" },
        { value: "base", label: "일반" },
        { value: "off", label: "끄기" },
      ],
      onChange: (value) => {
        const next = value as typeof basemap;
        setBasemap(next);
        writeBasemapPref(next);
      },
    });
    if (buildingsEnabled)
      items.push({
        kind: "segmented",
        id: "scene",
        label: "지도 표현",
        value: scene,
        options: [
          { value: "city", label: "입체 현황판" },
          { value: "flat", label: "평면" },
        ],
        onChange: (value) => setScene(value as "city" | "flat"),
      });
    items.push({
      kind: "segmented",
      id: "school-chart",
      label: "학교 표현",
      value: schoolChart,
      options: [
        { value: "auto", label: "자동" },
        { value: "columns", label: "원통" },
        { value: "dots", label: "점" },
      ],
      onChange: (value) => {
        void setSchoolChart(value as "auto" | "columns" | "dots");
      },
    });
    items.push({
      id: "school-names",
      label: "학교명",
      pressed: showSchoolNames,
      onToggle: () => setShowSchoolNames((value) => !value),
    });
    items.push({
      id: "emd",
      label: "읍면동 경계",
      pressed: emdEnabled,
      onToggle: handleEmdToggle,
    });
    return items;
  }, [
    showSchoolNames,
    emdEnabled,
    handleEmdToggle,
    scene,
    setScene,
    buildingsEnabled,
    schoolChart,
    setSchoolChart,
    basemap,
  ]);

  const basemapOn = !!VWORLD_KEY && basemap !== "off";
  const basemapLayer = useMemo(
    () => (VWORLD_KEY && basemap !== "off" ? makeBasemapLayer(VWORLD_KEY, basemap) : null),
    [basemap],
  );

  // Only ever fetches while emdEnabled AND a 시군 is selected (see
  // useEmdBoundaries' own doc comment for why it's also safe re: e2e's
  // zero-console-error assertions) — null the rest of the time.
  const emdFc = useEmdBoundaries(selectedCode, emdEnabled);

  const buildingsVisible =
    buildingsEnabled && buildingsActive(scene, zoom, mobile);
  const buildingLayer = useMemo(
    () =>
      buildingsVisible
        ? makeBuildingLayer({
            mobile,
            issueActive: !!issueModel,
            retry: buildingRetry,
            onStatus: onBuildingStatus,
          })
        : null,
    [buildingsVisible, mobile, issueModel, buildingRetry, onBuildingStatus],
  );
  const layers = useMemo<LayersList>(() => {
    const transitionDuration = 0;
    const layerList: LayersList = [
      basemapLayer,
      basemapLayer && basemap !== "off" ? makeBasemapWashLayer(basemap) : null,
      makeFlatRegionsLayer(
        bundle.regions,
        selectedCode,
        handleRegionClick,
        issueModel,
      ).clone({
        getFillColor: (f) =>
          (metricModel.kind === "region" || metricModel.regionOverlay)
            ? metricModel.regionColor(f.properties.code)
            : [255, 255, 255, 0],
        getLineColor: (f) => f.properties.code === selectedCode ? [131,230,239,255] : f.properties.code === compareCode ? [176,185,255,255] : [104,144,172,190],
        getLineWidth: (f) => f.properties.code === selectedCode || f.properties.code === compareCode ? 3 : 1,
        updateTriggers: {
          getFillColor: [metricModel],
          getLineColor: [selectedCode, compareCode],
          getLineWidth: [selectedCode, compareCode],
        },
      }),
      densityVisible
        ? makeDensityLayer(positionedSchools, metricModel, mobile)
        : null,
      buildingLayer,
      buildingLayer
        ? makeFlatRegionsLayer(
            bundle.regions,
            selectedCode,
            handleRegionClick,
          ).clone({
            id: "region-boundaries",
            filled: false,
            getLineColor: (f) => f.properties.code === selectedCode ? [131,230,239,255] : f.properties.code === compareCode ? [176,185,255,255] : [104,144,172,190],
            getLineWidth: (f) => f.properties.code === selectedCode || f.properties.code === compareCode ? 3 : 1,
            updateTriggers: { getLineColor: [selectedCode, compareCode], getLineWidth: [selectedCode, compareCode] },
            pickable: false,
            parameters: { depthCompare: "always", depthWriteEnabled: false },
          })
        : null,
      emdEnabled && selectedCode && emdFc
        ? makeEmdBoundaryLayer(emdFc, {
            elevation: 1,
            triggerKey: indicatorId,
            transitionDuration,
          })
        : null,
      columnsVisible
        ? makeSchoolChartLayer(
            positionedSchools,
            heightOfSchool,
            highlightedSchoolId,
            handleSchoolClick,
          ).clone({
            getFillColor: metricModel.color,
            updateTriggers: {
              getElevation: [heightOfSchool],
              getFillColor: [metricModel],
            },
          })
        : null,
      makeFlatSchoolsLayer(
        metricModel.specialEducation
          ? positionedSchools.filter((s) => s.level !== "special")
          : positionedSchools,
        highlightedSchoolId,
        handleSchoolClick,
      ).clone({
        getFillColor: (s) => {
          const c = metricModel.color(s);
          return issueModel && selectedCode && s.regionCode !== selectedCode && s.regionCode !== compareCode ? [c[0],c[1],c[2],65] : c;
        },
        getLineColor: (s) => s.id === highlightedSchoolId ? [131,230,239,255] : emphasizeZero && issueModel?.metric === "decline-small" && schoolFacts?.schools[s.id]?.entrants === 0 ? [242,140,98,255] : [8,20,33,255],
        getLineWidth: (s) => s.id === highlightedSchoolId || (emphasizeZero && issueModel?.metric === "decline-small" && schoolFacts?.schools[s.id]?.entrants === 0) ? 3 : 1.5,
        getRadius:
          schoolChart === "auto" &&
          !densityVisible &&
          (metricModel.kind === "density" || metricModel.proportional)
            ? (s) =>
                Math.max(
                  5,
                  18 *
                    Math.sqrt(
                      (metricModel.value(s) ?? 0) /
                        Math.max(1, metricModel.maximum),
                    ),
                )
            : 5,
        radiusMaxPixels: 18,
        updateTriggers: {
          getFillColor: [metricModel, selectedCode, compareCode, issueModel],
          getRadius: [metricModel, schoolChart, densityVisible],
          getLineColor: [highlightedSchoolId, emphasizeZero, issueModel, schoolFacts],
          getLineWidth: [highlightedSchoolId, emphasizeZero, issueModel, schoolFacts],
        },
      }),
      metricModel.specialEducation
        ? makeSpecialSchoolLayer(
            positionedSchools,
            metricModel,
            handleSchoolClick,
          )
        : null,
      issueModel && schoolFacts?.resources?.length
        ? new ScatterplotLayer<IssueResource>({
            id: "issue-resources",
            data: schoolFacts.resources.filter((resource) =>
              resource.issue === issueModel.issue.id && resource.metric === issueModel.metric &&
              resource.lat != null && resource.lng != null),
            getPosition: (resource) => [resource.lng!, resource.lat!],
            getRadius: 6,
            radiusUnits: "pixels",
            getFillColor: [67, 207, 224, 225],
            getLineColor: [8, 20, 33, 255],
            lineWidthUnits: "pixels",
            getLineWidth: 2,
            stroked: true,
            pickable: true,
            onClick: ({ object }) => {
              if (object?.regionCode) handleRegionClick(object.regionCode);
            },
          })
        : null,
    ];
    if (fontReady) {
      // Screen-space placement above resolves collisions before either text layer draws.
      layerList.push(
        makeSchoolLabelsLayer(visibleLabels.schools, {
          collisionEnabled: false,
          highlightedId: highlightedSchoolId,
          textOf: schoolHudLabel,
          elevationOf: () => 0,
          heightOf: () => 0,
          heightKey: "flat",
          visible: schoolLabelsVisible,
          fontFamily,
          characterSet,
          triggerKey: indicatorId,
          transitionDuration,
        }).clone({
          getPosition: (school) => [
            school.lng,
            school.lat,
            heightOfSchool(school),
          ],
          updateTriggers: { getPosition: [heightOfSchool] },
        }),
        makeRegionLabelLayer(visibleLabels.regions, {
          collisionEnabled: false,
          elevationOf: () => 0,
          textOf: labelTextOf,
          triggerKey: indicatorId,
          fontFamily,
          characterSet,
          selectedCode,
          priorityOf,
          transitionDuration,
        }),
      );
    }
    return layerList;
  }, [
    basemapLayer,
    basemap,
    metricModel,
    compareCode, emphasizeZero, schoolFacts,
    densityVisible,
    mobile,
    schoolChart,
    columnsVisible,
    heightOfSchool,
    buildingLayer,
    issueModel,
    bundle.regions,
    selectedCode,
    handleRegionClick,
    emdEnabled,
    emdFc,
    indicatorId,
    positionedSchools,
    highlightedSchoolId,
    handleSchoolClick,
    fontReady,
    schoolLabelsVisible,
    schoolHudLabel,
    fontFamily,
    characterSet,
    visibleLabels,
    labelTextOf,
    priorityOf,
  ]);

  // Fires every frame. The first frame after the initial view state is
  // ready flips the wrapper's data-map-ready flag (e2e/smoke.spec.ts waits
  // on it) and, in the e2e build only, exposes the live Deck instance so
  // Playwright can project a region's ground point to a canvas pixel
  // (e2e/select-region.spec.ts's canvas-click coverage).
  //
  // CI Linux fix (ci-linux-fixes branch, see ci-fix-report.md) — SEPARATELY,
  // the first frame to occur once fontReadyRef.current is true flips
  // data-labels-ready. This is NOT the same moment as useFontGate's own
  // fontReady (exposed as data-font-ready): fontReady only means the FONT
  // ITSELF finished loading — `layers` below still has to recompute (a
  // normal React effect-driven re-render) and DeckGL still has to process
  // that new `layers` prop and actually draw a frame with the label
  // TextLayer in it, which is when deck.gl SYNCHRONOUSLY builds the
  // TextLayer's SDF atlas (rasterizing all ~316 charset.json glyphs via
  // tiny-sdf — CPU-heavy, main-thread, no `await` to hang a wait on). A
  // Playwright trace from a real CI failure (run 35542371166) showed a
  // single `mouse.move()` taking over 3 SECONDS to resolve — i.e. the main
  // thread was blocked, almost certainly by exactly this — despite the
  // click sequence already having waited for data-font-ready. Once THIS
  // frame has fired, that synchronous work is provably done; e2e waits on
  // data-labels-ready (not data-font-ready) before ever touching the
  // canvas.
  const handleAfterRender = useCallback(() => {
    if (!containerRef.current) return;
    const viewport = deckRef.current?.deck?.getViewports()[0] as
      WebMercatorViewport | undefined;
    if (viewport) {
      const key = [
        viewport.width,
        viewport.height,
        viewport.longitude,
        viewport.latitude,
        viewport.zoom,
        viewport.pitch,
      ].join(",");
      if (
        key !== lastLabelViewportKey.current &&
        performance.now() - lastLabelUpdateTime.current >= 100
      ) {
        lastLabelUpdateTime.current = performance.now();
        if (labelUpdateTimer.current) clearTimeout(labelUpdateTimer.current);
        labelUpdateTimer.current = null;
        lastLabelViewportKey.current = key;
        queueMicrotask(() => {
          setLabelViewport(viewport);
          setZoom(viewport.zoom);
        });
      } else if (
        key !== lastLabelViewportKey.current &&
        !labelUpdateTimer.current
      ) {
        labelUpdateTimer.current = setTimeout(() => {
          labelUpdateTimer.current = null;
          deckRef.current?.deck?.redraw("label placement update");
        }, 100);
      }
    }
    if (!mapReadyRef.current) {
      mapReadyRef.current = true;
      containerRef.current.setAttribute("data-map-ready", "true");
      if (process.env.NEXT_PUBLIC_E2E === "1" && deckRef.current?.deck) {
        window.__jbmap = {
          deck: deckRef.current.deck,
          events: [],
          // Deferred via queueMicrotask — same reasoning as
          // handleViewStateChange's own queueMicrotask(() => setZoom(...))
          // above: this runs from Playwright's page.evaluate(), a foreign
          // call stack outside React's own event handling, and
          // handleRegionClick ultimately calls onSelect -> setRegion ->
          // nuqs's router.push (a synchronous history/URL update). Calling
          // that update synchronously from within page.evaluate() risks
          // the same "update while a different context is mid-callback"
          // hazard that comment already documents, PLUS Playwright's CDP
          // Runtime.callFunctionOn is not guaranteed to tolerate a
          // synchronous navigation-triggering side effect happening on its
          // own call stack. queueMicrotask lets evaluate() return cleanly
          // first; the actual selection update runs a tick later.
          selectRegion: (code: string) => {
            queueMicrotask(() => handleRegionClickRef.current(code));
          },
        };
      }
    }
    if (fontReadyRef.current && !labelsReadyRef.current) {
      labelsReadyRef.current = true;
      containerRef.current.setAttribute("data-labels-ready", "true");
    }
  }, []);

  return (
    <div
      id="school-map"
      ref={containerRef}
      className="hud-map relative h-full w-full bg-paper outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      style={WIDGET_THEME_STYLE}
      tabIndex={0}
      aria-label={`${ACTIVE_PROFILE.province.shortName} 학교 위치 지도`}
      onKeyDown={handleWrapperKeyDown}
      // 사용자 요구(2026-09-21): 지도 위 우클릭은 아무 조작도 아니므로(회전 제거)
      // 브라우저 컨텍스트 메뉴가 뜨지 않게 한다.
      onContextMenu={(event) => event.preventDefault()}
      onPointerDownCapture={(event) => {
        pointerDownRef.current = event.button === 0 && event.target instanceof HTMLCanvasElement && event.target.id === "deckgl-overlay"
          ? { x: event.clientX, y: event.clientY, id: event.pointerId }
          : null;
      }}
      onPointerCancelCapture={() => { pointerDownRef.current = null; }}
      onPointerUpCapture={(event) => {
        const start = pointerDownRef.current;
        pointerDownRef.current = null;
        if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
        if (!(event.target instanceof HTMLCanvasElement) || event.target.id !== "deckgl-overlay") return;
        // At the province overview, school dots are densely packed. Keep the
        // region surface clickable there and reserve the forgiving radius for
        // a region close-up or an explicit dots/columns view.
        if (selectedCode === null && schoolChart === "auto") return;
        const bounds = event.currentTarget.getBoundingClientRect();
        const hit = deckRef.current?.deck?.pickObject({
          x: event.clientX - bounds.left,
          y: event.clientY - bounds.top,
          radius: mobile ? 14 : 9,
          layerIds: ["schools", "school-columns", "schools-special"],
        });
        const schoolId = (hit?.object as { id?: string } | undefined)?.id;
        if (!schoolId) return;
        handleSchoolClick(schoolId);
        event.stopPropagation();
      }}
      // CI Linux fix — useFontGate's OWN gate: the font itself finished
      // loading. Decoupled from data-map-ready (deck.gl's first render
      // frame, unrelated to fonts). NOT what e2e waits on before touching
      // the canvas, though — see handleAfterRender's comment on
      // data-labels-ready (set imperatively below) for why this alone
      // isn't a safe "labels can actually render" signal.
      data-font-ready={fontReady ? "true" : undefined}
    >
      {cameraViewState && (
        <DeckGL
          ref={deckRef}
          initialViewState={cameraViewState}
          views={views}
          controller={interactionBlocked ? false : { ...CONTROLLER, maxBounds: undefined }}
          layers={layers}
          widgets={widgets}
          getTooltip={getTooltip}
          getCursor={getCursor}
          onAfterRender={handleAfterRender}
          onClick={handleDeckClick}
          onViewStateChange={handleViewStateChange}
          onDeviceInitialized={(device) =>
            setHeatmapSupported(supportsDensity(device))
          }
          onError={handleDeckError}
          // Task A — DPR cap: `useDevicePixels` is an ABSOLUTE multiplier when
          // given a number (NOT relative to the device's own DPR) — passing
          // devicePixelRatio straight through supersamples on an already-high-DPR
          // screen. `Math.min(..., 1.5)` caps render resolution without ever
          // exceeding the device's native pixel ratio.
          useDevicePixels={Math.min(
            window.devicePixelRatio || 1,
            mobile ? 1 : 1.5,
          )}
        />
      )}
      {selectedSchool && labelViewport && !(settingsOpen && labelViewport.width < 1024) && (
        <SchoolHud
          school={selectedSchool}
          viewport={labelViewport}
          metric={metricModel}
          obstacles={hudLayout?.obstacles}
          onClose={() => onHighlightSchool(null)}
          onStatistics={onSchoolStatistics}
        />
      )}
      <MetricLegend
        key={highlightedSchoolId ?? "overview"}
        metric={metricModel}
        density={densityVisible}
        schoolSelected={!!highlightedSchoolId}
        selectedRegionSummary={selectedCode ? `${nameOf(selectedCode)} · ${issueModel ? issueModel.regions.find((r) => r.code === selectedCode)?.text ?? "자료 없음" : map.get(selectedCode) == null ? "자료 없음" : formatWithUnit(def, map.get(selectedCode)! )}` : undefined}
        densityUnavailable={
          schoolChart === "auto" &&
          metricModel.kind === "density" &&
          zoom < 13 &&
          !heatmapSupported
        }
      >
        {schoolChart === "columns" && (
          <div
            data-testid="school-chart-legend"
            className="max-w-full rounded border border-line bg-surface/95 px-3 py-2 text-xs text-ink-muted"
          >
            {scene === "flat" ? (
              "원통 높이는 입체 현황판에서 표시됩니다"
            ) : chartMetric ? (
              <>
                <p className="font-semibold text-ink">
                  원통 높이 · {chartMetric.label}
                </p>
                {chartMetric.heightMode === "school-count" ? (
                  <>
                    <p>원통 1개 = 학교 1교 · 낮은 동일 높이</p>
                    <p>집계 제외·자료 없음은 점으로 표시</p>
                  </>
                ) : (
                  <>
                    <p>
                      0 → {chartValueText(chartMax, chartMetric.unit)} · {ACTIVE_PROFILE.province.shortName}
                      전체 학교 기준
                    </p>
                    <p>높이는 값에 정비례 · 0·자료 없음은 점으로 표시</p>
                  </>
                )}
              </>
            ) : (
              <p>이 지표는 학교별 높이 자료가 없어 점으로 표시합니다</p>
            )}
          </div>
        )}
      </MetricLegend>
      <MapOverlay
        collapsible
        expanded={settingsOpen}
        onExpandedChange={setSettingsOpen}
        items={overlayItems}
        attribution={basemapOn ? BASEMAP_ATTRIBUTION : undefined}
      >
        {scene === "city" && (
          <div
            className="max-w-full rounded border border-line bg-surface/90 px-2 py-1 text-[10px] text-ink-muted"
            role="status"
          >
            {!buildingsVisible ? (
              <p>건물은 더 확대하면 표시됩니다</p>
            ) : (
              <>
                <p>건물 © 국토교통부·브이월드 · 일부 높이는 층수로 추정</p>
                {buildingFetchedAt && (
                  <p>
                    건물 조회:{" "}
                    {new Date(buildingFetchedAt).toLocaleString("ko-KR")}
                  </p>
                )}
                {buildingErrors.size > 0 && (
                  <p>
                    일부 건물 정보를 불러오지 못했습니다{" "}
                    <button
                      className="pointer-events-auto underline"
                      onClick={() => {
                        setBuildingErrors(new Set());
                        setBuildingRetry((n) => n + 1);
                      }}
                    >
                      재시도
                    </button>
                  </p>
                )}
              </>
            )}
          </div>
        )}
      </MapOverlay>
      {contextLost && (
        <div
          role="alert"
          className="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-paper/90 text-center text-sm text-ink"
        >
          <p>그래픽 컨텍스트가 끊겼습니다</p>
          <button
            type="button"
            onClick={() => {
              setScene("flat");
              const url = new URL(window.location.href);
              url.searchParams.set("scene", "flat");
              window.location.assign(url);
            }}
            className="rounded bg-ink/5 px-3 py-1.5 hover:bg-ink/15"
          >
            평면으로 다시 열기
          </button>
        </div>
      )}
      <div aria-live="polite" className="sr-only">
        {announcement}
      </div>
    </div>
  );
}
