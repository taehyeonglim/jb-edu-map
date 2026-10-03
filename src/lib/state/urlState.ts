/**
 * URL-synchronized state for the map's selected indicator and region, via
 * nuqs (v2). The URL is the single source of truth for both — share,
 * refresh, and back/forward all just re-derive state from it; no React
 * state duplicates these values anywhere else in the app (see the task
 * brief's "상태·데이터 흐름" excerpt).
 *
 * `region` (시군 selection) is parsed/typed here the same way. useMapQuery()
 * exposes both as regionCode/setRegion, consumed by Dashboard/DeckMap for
 * the map's click/keyboard/RegionList selection.
 */
"use client";

import { debounce, parseAsString, parseAsStringLiteral, throttle, useQueryStates } from "nuqs";
import type { SchoolFilters } from "../schools/filter";

import { ISSUE_IDS, ISSUE_METRICS, issueById, resolveIssueMetric } from "../issues/registry";

export const MAP_VIEWS = ["schools", "issues", "statistics"] as const;
export type MapPanelView = (typeof MAP_VIEWS)[number];

import { REGION_CODES, type RegionCode } from "../geo/regions";
import { DEFAULT_INDICATOR_ID, INDICATOR_IDS } from "../indicators/registry";

/**
 * Invalid or missing -> DEFAULT_INDICATOR_ID. The map always has an
 * indicator selected, so this parser never surfaces null to callers.
 */
export const indicatorParser = parseAsStringLiteral(INDICATOR_IDS).withDefault(DEFAULT_INDICATOR_ID);

/**
 * Invalid or missing -> null (no 시군 selected). REGION_CODES deliberately
 * excludes '52000' (전북 전체, the province aggregate row) — it is not a
 * selectable 시군, so `?region=52000` parses to null same as any other
 * unrecognized value.
 */
export const regionParser = parseAsStringLiteral(REGION_CODES);

/** Shared by useMapQuery() and tests/unit/urlState.test.ts's createLoader() check. */
export const mapQueryParsers = {
  q: parseAsString.withDefault("").withOptions({ limitUrlUpdates: debounce(250) }),
  schoolLevel: parseAsStringLiteral(["all", "elem", "mid", "high", "special"] as const).withDefault("all"),
  indicator: indicatorParser,
  region: regionParser,
  view: parseAsStringLiteral(MAP_VIEWS).withDefault("schools"),
  issue: parseAsStringLiteral(ISSUE_IDS),
  issueMetric: parseAsStringLiteral(ISSUE_METRICS),
  compareRegion: regionParser,
  issueLevel: parseAsStringLiteral(["elem", "mid", "high"] as const).withDefault("elem"),
  zeroEntrants: parseAsStringLiteral(["on", "off"] as const).withDefault("off"),
};

export interface MapQuery {
  search: string;
  schoolLevel: SchoolFilters["level"];
  setSearch: (name: string) => void;
  setSchoolLevel: (level: SchoolFilters["level"]) => void;
  resetFilters: () => void;
  view: MapPanelView;
  compareRegion: RegionCode | null;
  issueLevel: "elem" | "mid" | "high";
  zeroEntrants: boolean;
  setCompareRegion: (code: RegionCode | null) => void;
  setIssueLevel: (level: "elem" | "mid" | "high") => void;
  setZeroEntrants: (enabled: boolean) => void;
  issueId: string | null;
  issueMetric: string | null;
  setView: (view: MapPanelView) => void;
  setIssue: (id: string | null, metric?: string) => void;
  setIssueMetric: (metric: string) => void;
  indicatorId: string;
  regionCode: RegionCode | null;
  /** Replaces the current history entry — switching indicators doesn't clutter back/forward. */
  setIndicator: (id: string) => void;
  /**
   * A transition to/from "nothing selected" (null <-> code) pushes a new
   * history entry — Back after Esc/✕ restores the prior selection, and Back
   * after the first selection returns to the unselected list, per the task
   * brief. A transition BETWEEN two selected regions (arrow-key cycling, a
   * canvas click on a different region, …) instead REPLACES the current
   * entry, so cycling doesn't push one history entry per step (fix round 1,
   * review finding #2) — see the history-mode branch inside useMapQuery.
   */
  setRegion: (code: RegionCode | null) => void;
}

/**
 * The single hook every component reads/writes {indicator, region} through.
 * Multiple components may call this independently (e.g. both Dashboard and
 * IndicatorMenu do) — nuqs keeps them in sync via the URL, so no prop
 * drilling of the setters is needed.
 */
export function useMapQuery(): MapQuery {
  const [{ q, schoolLevel, indicator, region, view, issue, issueMetric, compareRegion, issueLevel, zeroEntrants }, setQuery] = useQueryStates(mapQueryParsers, {
    history: "replace",
    shallow: true,
  });

  const definition = issueById(issue);
  return {
    search: q,
    schoolLevel,
    setSearch(name) { void setQuery({ q: name }, name ? undefined : { limitUrlUpdates: throttle(0) }); },
    setSchoolLevel(level) { void setQuery({ schoolLevel: level }); },
    resetFilters() { void setQuery({ q: null, schoolLevel: null, region: null, compareRegion: null }, { limitUrlUpdates: throttle(0) }); },
    view,
    compareRegion: region && compareRegion !== region ? compareRegion : null,
    issueLevel,
    zeroEntrants: zeroEntrants === "on",
    setCompareRegion(code) { void setQuery({ compareRegion: code === region ? null : code }); },
    setIssueLevel(level) { void setQuery({ issueLevel: level }); },
    setZeroEntrants(enabled) { void setQuery({ zeroEntrants: enabled ? "on" : "off" }); },
    issueId: definition?.id ?? null,
    issueMetric: definition ? resolveIssueMetric(definition, issueMetric) : null,
    setView(next) {
      void setQuery({ view: next }, { history: "push" });
    },
    setIssue(id, metric) {
      const next = issueById(id);
      void setQuery({ view: "issues", issue: next?.id ?? null, issueMetric: next ? resolveIssueMetric(next, metric ?? null) : null, ...(next?.id !== definition?.id ? { q: null, schoolLevel: null } : {}) }, { history: "push", limitUrlUpdates: throttle(0) });
    },
    setIssueMetric(metric) {
      if (definition) void setQuery({ issueMetric: resolveIssueMetric(definition, metric) });
    },
    indicatorId: indicator,
    regionCode: region,
    setIndicator(id) {
      void setQuery({ indicator: id, issue: null, issueMetric: null, ...(definition ? { q: null, schoolLevel: null } : {}) }, { limitUrlUpdates: throttle(0) });
    },
    setRegion(code) {
      // History semantics (fix round 1, review finding #2): only a
      // transition to/from "nothing selected" pushes — a transition between
      // two selected regions (any path: arrow keys, a list click while
      // already selected, a canvas click on a different region, ...)
      // replaces instead, so e.g. cycling ←/→ through several regions
      // doesn't push one history entry per step (which would make a single
      // Back only undo the last step, instead of leaving the map). `region`
      // here is the CURRENT value from this render's useQueryStates()
      // destructure above, so this always compares against the selection
      // being replaced, not a stale snapshot.
      const history = code === null || region === null ? "push" : "replace";
      void setQuery({ region: code, ...(!code || code === compareRegion ? { compareRegion: null } : {}) }, { history });
    },
  };
}
