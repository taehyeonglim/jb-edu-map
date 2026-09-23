"use client";

import { useState } from "react";

import TimeSeriesChart from "@/components/ui/TimeSeriesChart";
import type { DataBundle } from "@/lib/data/types";
import { REGION_CODES, regionName } from "@/lib/geo/regions";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/indicators/groups";
import { indicatorById, INDICATORS } from "@/lib/indicators/registry";
import type { IndicatorGroup, SchoolLevel } from "@/lib/indicators/types";
import { SCHOOL_LEVEL_LABELS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";
import type { School } from "@/lib/schools/types";
import { displayLabel, rank, referenceDateLabel, shareOfProvince, trend, valueMap, vsProvince } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";
import { formatDelta, formatShare } from "@/lib/tooltipText";

export interface RegionPanelProps {
  showSchools?: boolean;
  bundle: Pick<DataBundle, "indicators" | "series" | "schools" | "closedSchools">;
  /** The currently-highlighted school (map point click / this panel's own row click), or null. Owned by Dashboard, mirrored to DeckMap so either side can drive it. */
  highlightedSchoolId: string | null;
  /** Called with a school id to highlight it, or null to clear. This component does its own "click the same row again -> clear" toggle before calling it (mirroring DeckMap's point-click handler). */
  onHighlightSchool: (id: string | null) => void;
}

type LevelFilter = SchoolLevel | "all";

const LEVEL_FILTERS: LevelFilter[] = ["all", ...SCHOOL_LEVEL_ORDER];
const LEVEL_FILTER_LABELS: Record<LevelFilter, string> = { all: "전체", ...SCHOOL_LEVEL_LABELS };

/** desc by students; a null student count (rare — 자료 없음) sorts last rather than first/undefined-ordered. */
function byStudentsDesc(a: School, b: School): number {
  if (a.students === b.students) return 0;
  if (a.students === null) return 1;
  if (b.students === null) return -1;
  return b.students - a.students;
}

interface OtherIndicatorRow {
  group: IndicatorGroup;
  id: string;
  label: string;
  valueText: string;
  rankText: string;
  isCurrent: boolean;
}

/**
 * The right panel's selected state: the current indicator's value/rank/전북
 * 대비 for `regionCode`, its annual trend, and a full indicator
 * "다른 지표" table. Self-contained like IndicatorMenu/RegionList — reads
 * `indicatorId`/`regionCode` and writes both via useMapQuery() itself, so
 * Dashboard only needs to pass the loaded data bundle (and only render this
 * at all once `regionCode` is set — the `!regionCode` guard below is a
 * defensive fallback, not the primary gate).
 */
export default function RegionPanel({ bundle, highlightedSchoolId, onHighlightSchool, showSchools = true }: RegionPanelProps) {
  const { indicatorId, regionCode, setIndicator, setRegion } = useMapQuery();
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  // fix round, review finding #3: reset the 학교급 filter back to "전체"
  // whenever the selected region changes — otherwise e.g. a "고" filter
  // picked in one 시군 would silently carry over into the next one, which
  // may have zero schools at that level (showing an empty/confusing list
  // instead of the new region's full list). Render-time "adjusting state
  // when a prop changes" (react.dev/learn/you-might-not-need-an-effect),
  // same pattern Dashboard.tsx already uses for highlightedSchoolId — avoids
  // an extra cascading render a useEffect-based reset would cost, and must
  // run before the `!regionCode` early return below (Rules of Hooks: every
  // hook call above needs to run unconditionally on every render anyway).
  const [levelFilterRegion, setLevelFilterRegion] = useState(regionCode);
  if (regionCode !== levelFilterRegion) {
    setLevelFilterRegion(regionCode);
    setLevelFilter("all");
  }

  if (!regionCode) return null;

  const def = indicatorById(indicatorId);
  if (!def) throw new Error(`RegionPanel: unknown indicatorId "${indicatorId}"`);

  const file = bundle.indicators[indicatorId];
  const map = valueMap(file);
  const label = displayLabel(def, bundle.series);
  const value = map.get(regionCode);
  const regionRank = rank(map).get(regionCode) ?? null;
  // Task 5, Section D (fix round 2): count-kind 52000 rows are a province-
  // wide TOTAL (Σ), not an average, so a subtracted "전북 총계 대비
  // −95,514명" misreports the number — count-kind now shows "${ACTIVE_PROFILE.province.shortName} 대비 비중"
  // (시군값/52000값×100, 0-100%) instead. ratio-kind keeps the original
  // subtraction ("${ACTIVE_PROFILE.province.shortName} 평균 대비 ±x"), which IS a true Σ/Σ average.
  const share = def.kind === "count" ? shareOfProvince(map, regionCode) : null;
  const delta = def.kind === "ratio" ? vsProvince(map, regionCode) : null;
  // Same warning-tone rule as KpiTiles: an INCREASE is only ever flagged when
  // higher reads as worse — a share isn't a directional delta, so this only
  // ever applies to the ratio-kind branch.
  const isWarnDelta = def.kind === "ratio" && delta !== null && delta > 0 && def.polarity === "higherWorse";

  // Task 4B — 학교 목록: the selected 시군's schools, then the 학교급 chip
  // filter, sorted by students desc. The summary line ("학교 N개 · 소규모
  // M개") intentionally reflects THIS filtered set (not the region's full
  // count) so it always matches what the table below actually shows.
  const regionSchools = bundle.schools.schools.filter((s) => s.regionCode === regionCode);
  const filteredSchools = (levelFilter === "all" ? regionSchools : regionSchools.filter((s) => s.level === levelFilter))
    .slice()
    .sort(byStudentsDesc);
  const smallCount = filteredSchools.filter((s) => s.small).length;
  // fix-round-1: 특수학교 rows carry no coordinate (see School.locationMissingReason) — surfaced in the summary line whenever the current filter includes any.
  const noLocationCount = filteredSchools.filter((s) => s.lat === null).length;

  // Task 5 — 폐교 목록: the selected 시군's 폐교 rows, most recent 폐교연도
  // first (a reasonable default; the whole list is short enough — see the
  // per-region table in task-5-report.md — that no further filter/sort UI
  // is needed here, unlike the 학교 목록 above).
  const regionClosedSchools = bundle.closedSchools.rows
    .filter((s) => s.regionCode === regionCode)
    .slice()
    .sort((a, b) => b.year - a.year);

  const seriesFile = bundle.series[indicatorId];
  const trendRows = seriesFile ? trend(seriesFile, regionCode) : [];

  const otherRows: OtherIndicatorRow[] = INDICATORS.map((otherDef) => {
    const otherMap = valueMap(bundle.indicators[otherDef.id]);
    const otherValue = otherMap.get(regionCode);
    const otherRank = rank(otherMap).get(regionCode) ?? null;
    return {
      group: otherDef.group,
      id: otherDef.id,
      // Fix round 2, finding 4 — this used to be raw `otherDef.label`, so
      // students_change_5y showed the static "학생수 5년 증감률" here while
      // the menu button/Legend/current-indicator header above (which all
      // already call displayLabel()) showed the dynamic "학생수 2022→2026
      // 증감률" for the very same indicator.
      label: displayLabel(otherDef, bundle.series),
      valueText: otherValue === null || otherValue === undefined ? "자료 없음" : otherDef.format(otherValue),
      rankText: otherRank !== null ? `${otherRank}위` : "–",
      isCurrent: otherDef.id === indicatorId,
    };
  });

  // Plain block flow, no inner scroll region: Dashboard's <aside> is
  // already `overflow-y-auto` at a fixed 360px width — letting it scroll
  // this whole panel as one unit (rather than nesting a second `flex-1
  // overflow-y-auto` pocket just around the 다른 지표 table) means every
  // row is always in normal flow. A nested scroll pocket here previously
  // left the last group's rows scrolled out of view with no visible
  // scrollbar (confirmed against a real screenshot) — easy to misread as
  // missing data. What now scrolls out of view on a short viewport is the
  // footer, which reads unambiguously as "there's more below".
  return (
    <div className="text-ink">
      <div className="mb-3 flex items-start justify-between gap-2">
        <h2 className="text-lg font-semibold">{regionName(regionCode)}</h2>
        <button
          type="button"
          aria-label="선택 해제"
          onClick={() => setRegion(null)}
          className="rounded px-2 py-1 text-ink-muted hover:bg-ink/10 hover:text-ink"
        >
          ✕
        </button>
      </div>

      <section className="mb-4 rounded-lg bg-ink/5 p-3">
        <p data-testid="region-panel-current-label" className="text-xs text-ink-muted">
          {label}
        </p>
        <p className="mt-1 tabular-nums">
          <span data-testid="region-panel-current-value" className="text-2xl font-bold">
            {value === null || value === undefined ? "자료 없음" : def.format(value)}
          </span>
          <span className="ml-1 text-sm text-ink-muted">{def.unit}</span>
        </p>
        <p className="mt-1 text-xs text-ink-muted">
          {regionRank !== null ? `${REGION_CODES.length}개 시군 중 ${regionRank}위` : "순위 없음"}
        </p>
        <p
          data-testid="region-panel-delta"
          className={`text-xs ${isWarnDelta ? "text-warning-text" : "text-ink-muted"}`}
        >
          {def.kind === "count"
            ? share === null
              ? `${ACTIVE_PROFILE.province.shortName} 대비 비중 자료 없음`
              : `${ACTIVE_PROFILE.province.shortName} 대비 비중 ${formatShare(share)}`
            : delta === null
              ? `${ACTIVE_PROFILE.province.shortName} 평균 대비 자료 없음`
              : `${ACTIVE_PROFILE.province.shortName} 평균 대비 ${formatDelta(def, delta)}`}
        </p>
        <p data-testid="region-panel-description" className="mt-2 text-[10px] leading-snug text-ink-muted">
          {def.description}
        </p>
        {def.caveat && (
          <p data-testid="region-panel-caveat" className="mt-1 text-[10px] leading-snug text-ink-muted">
            {def.caveat}
          </p>
        )}
      </section>

      <div className="mb-4">
        <TimeSeriesChart
          key={`${indicatorId}:${regionCode}`}
          data={trendRows}
          label={label}
          place={regionName(regionCode)}
          unit={def.unit}
          format={def.format}
          onShowStudents={indicatorId === "students_change_5y" ? () => setIndicator("students_total") : undefined}
        />
      </div>

      <section className="mb-4">
        <p className="mb-1 text-xs text-ink-muted">다른 지표</p>
        <table className="w-full border-collapse text-xs">
          <tbody>
            {GROUP_ORDER.flatMap((group) => {
              const items = otherRows.filter((row) => row.group === group);
              if (items.length === 0) return [];
              return [
                <tr key={`${group}-header`}>
                  <th
                    scope="colgroup"
                    colSpan={3}
                    className="pt-2 pb-1 text-left text-[10px] font-normal uppercase tracking-wide text-ink-muted"
                  >
                    {GROUP_LABELS[group]}
                  </th>
                </tr>,
                // The whole row activates the indicator switch (fix round 1,
                // review finding #3) — only the label cell used to. The
                // <button> stays the sole keyboard/a11y affordance (tab
                // stop, accessible name); the <tr>'s own onClick is a
                // mouse-only convenience for the rest of the row. The
                // button's handler stops propagation so a click ON the
                // button doesn't ALSO fire the row's handler (it would
                // bubble there otherwise — same setIndicator(row.id) call,
                // so a double-fire would be silently idempotent rather than
                // visibly broken, but the guard makes that explicit instead
                // of accidental).
                ...items.map((row) => (
                  <tr
                    key={row.id}
                    onClick={() => setIndicator(row.id)}
                    className="cursor-pointer hover:bg-ink/5"
                  >
                    <td className="py-0.5">
                      <button
                        type="button"
                        data-testid={`other-indicator-${row.id}`}
                        aria-current={row.isCurrent ? "true" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          setIndicator(row.id);
                        }}
                        className={`w-full rounded px-1 py-0.5 text-left ${
                          row.isCurrent ? "bg-accent-soft text-ink font-semibold" : ""
                        }`}
                      >
                        {row.label}
                      </button>
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-ink/80">{row.valueText}</td>
                    <td className="py-0.5 pl-2 text-right tabular-nums text-ink-muted">{row.rankText}</td>
                  </tr>
                )),
              ];
            })}
          </tbody>
        </table>
      </section>

      {showSchools && <section className="mb-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-xs text-ink-muted">
            학교 {filteredSchools.length}개 · 소규모 {smallCount}개
            {noLocationCount > 0 && <> · 위치 없음 {noLocationCount}개</>}
          </p>
          <p className="text-[10px] text-ink-muted">위치 기준 {bundle.schools.referenceDate.location}</p>
        </div>

        <div className="mb-2 flex flex-wrap gap-1">
          {LEVEL_FILTERS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setLevelFilter(level)}
              aria-pressed={levelFilter === level}
              className={`rounded px-2 py-0.5 text-xs ${
                levelFilter === level ? "bg-accent-soft font-semibold text-ink" : "text-ink-muted hover:bg-ink/5"
              }`}
            >
              {LEVEL_FILTER_LABELS[level]}
            </button>
          ))}
        </div>

        {filteredSchools.length === 0 ? (
          <p className="text-xs text-ink-muted">해당 학교급의 학교가 없습니다</p>
        ) : (
          <table className="w-full border-collapse text-xs">
            <tbody>
              {filteredSchools.map((school) => {
                const isHighlighted = school.id === highlightedSchoolId;
                return (
                  <tr
                    key={school.id}
                    data-testid={`school-row-${school.id}`}
                    aria-current={isHighlighted ? "true" : undefined}
                    onClick={() => onHighlightSchool(isHighlighted ? null : school.id)}
                    className={`cursor-pointer ${isHighlighted ? "bg-accent-soft text-ink" : "hover:bg-ink/5"}`}
                  >
                    <td className="py-0.5 pr-1">
                      <span className="mr-1 inline-block rounded bg-ink/5 px-1 text-[10px] text-ink-muted">
                        {SCHOOL_LEVEL_LABELS[school.level]}
                      </span>
                      {/* fix round, review finding #2: the <tr>'s onClick above is a
                          mouse-only convenience (matches the 다른 지표 row pattern) —
                          this <button> is the real keyboard/a11y affordance (tab stop,
                          accessible name = the school's name). Its handler stops
                          propagation so a click ON the button doesn't ALSO fire the
                          row's own onClick. */}
                      <button
                        type="button"
                        data-testid={`school-name-button-${school.id}`}
                        aria-current={isHighlighted ? "true" : undefined}
                        onClick={(event) => {
                          event.stopPropagation();
                          onHighlightSchool(isHighlighted ? null : school.id);
                        }}
                        className={`rounded px-0.5 text-left ${isHighlighted ? "font-semibold" : ""}`}
                      >
                        {school.name}
                      </button>
                      {school.branch && (
                        <span className="ml-1 inline-block rounded bg-ink/5 px-1 text-[10px] text-ink-muted">
                          분교장
                        </span>
                      )}
                      {school.small && (
                        <span className="ml-1 inline-block rounded bg-warning-soft px-1 text-[10px] text-warning-text">
                          소규모
                        </span>
                      )}
                      {school.lat === null && (
                        <span
                          className="ml-1 inline-block rounded bg-ink/5 px-1 text-[10px] text-ink-muted"
                          title={school.locationMissingReason}
                        >
                          위치 없음
                        </span>
                      )}
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-ink/80">
                      {school.students === null ? "자료 없음" : `${school.students.toLocaleString("ko-KR")}명`}
                    </td>
                    <td className="py-0.5 pl-2 text-right tabular-nums text-ink-muted">
                      {school.studentsPerClass === null ? "–" : school.studentsPerClass.toFixed(1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>}

      <section className="mb-4">
        <details data-testid="closed-schools-section">
          <summary className="cursor-pointer text-xs text-ink-muted hover:text-ink">
            폐교 목록 ({regionClosedSchools.length}개)
          </summary>
          {regionClosedSchools.length === 0 ? (
            <p className="mt-2 text-xs text-ink-muted">폐교 이력이 없습니다</p>
          ) : (
            <table className="mt-2 w-full border-collapse text-xs">
              <tbody>
                {regionClosedSchools.map((school) => (
                  <tr key={`${school.name}-${school.year}`} data-testid={`closed-school-row-${school.name}-${school.year}`}>
                    <td className="py-0.5 pr-1">
                      <span className="mr-1 inline-block rounded bg-ink/5 px-1 text-[10px] text-ink-muted">
                        {SCHOOL_LEVEL_LABELS[school.level]}
                      </span>
                      {school.name}
                    </td>
                    <td className="py-0.5 text-right tabular-nums text-ink-muted">{school.year}</td>
                    <td className="py-0.5 pl-2 text-right text-ink-muted">{school.usage}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </details>
      </section>

      <footer className="text-[10px] text-ink-muted">
        {def.source.name} · {referenceDateLabel(file)}
      </footer>
    </div>
  );
}
