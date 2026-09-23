"use client";

import type { MapMetricSpec } from "@/lib/mapMetrics";
import { chartValueText } from "@/lib/schools/chart";
import type { School } from "@/lib/schools/types";
import type { SchoolFilters } from "@/lib/schools/filter";
import { REGION_CODES, regionName, type RegionCode } from "@/lib/geo/regions";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import {
  SCHOOL_LEVEL_COLORS,
  SCHOOL_LEVEL_LABELS,
  SCHOOL_LEVEL_ORDER,
} from "@/lib/schoolVisuals";

export function SchoolLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
      aria-label="학교급 범례"
    >
      {SCHOOL_LEVEL_ORDER.map((level) => (
        <span key={level} className="flex items-center gap-1">
          <span
            className="h-2.5 w-2.5 rounded-full ring-1 ring-inset ring-ink/15"
            style={{
              backgroundColor: `rgb(${SCHOOL_LEVEL_COLORS[level].join(",")})`,
            }}
          />
          {SCHOOL_LEVEL_LABELS[level]}
        </span>
      ))}
    </div>
  );
}

export function SchoolDetail({
  school,
  onClose,
  onStatistics,
}: {
  school: School;
  onClose: () => void;
  onStatistics: (code: RegionCode) => void;
}) {
  const number = (value: number | null) =>
    value === null ? "자료 없음" : value.toLocaleString("ko-KR");
  return (
    <section
      aria-label="선택한 학교"
      className="rounded-xl border border-accent/30 bg-accent-soft p-3"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-xs text-ink-muted">
            {regionName(school.regionCode as RegionCode)} ·{" "}
            {SCHOOL_LEVEL_LABELS[school.level]}
          </p>
          <h2 className="mt-1 font-semibold">{school.name}</h2>
        </div>
        <button
          type="button"
          aria-label="학교 선택 해제"
          onClick={onClose}
          className="min-h-9 min-w-9 rounded hover:bg-ink/10"
        >
          ✕
        </button>
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {(
          [
            ["학생", school.students, "명"],
            ["학급", school.classes, "개"],
            ["교원", school.teachers, "명"],
          ] as const
        ).map(([label, value, unit]) => (
          <div key={label}>
            <dt className="text-xs text-ink-muted">{label}</dt>
            <dd className="mt-1 font-semibold tabular-nums">
              {number(value)}
              {value !== null && unit}
            </dd>
          </div>
        ))}
      </dl>
      {school.locationSource && (
        <div className="mt-3 text-xs text-ink-muted">
          <p>{school.locationSource.address}</p>
          <a
            href={school.locationSource.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-4"
          >
            학교 공식 위치 안내
          </a>
          <span> · 확인 {school.locationSource.verifiedAt}</span>
        </div>
      )}
      {school.lat === null && (
        <p className="mt-3 text-xs text-ink-muted">
          위치 자료 없음 · 지도에 표시할 수 없습니다.
        </p>
      )}
      <button
        type="button"
        className="mt-3 min-h-10 text-xs font-semibold text-accent-text underline underline-offset-4"
        onClick={() => onStatistics(school.regionCode as RegionCode)}
      >
        해당 시군 통계 보기
      </button>
    </section>
  );
}

export default function SchoolExplorer({
  metric,
  schools,
  filters,
  onFilters,
  selectedSchoolId,
  onSelect,
  selectedSchool,
  onStatistics,
}: {
  metric?: MapMetricSpec;
  schools: School[];
  filters: SchoolFilters;
  onFilters: (filters: SchoolFilters) => void;
  selectedSchoolId: string | null;
  onSelect: (id: string | null) => void;
  selectedSchool: School | null;
  onStatistics: (code: RegionCode) => void;
}) {
  const located = schools.filter(
    (s) => s.lat !== null && s.lng !== null,
  ).length;
  return (
    <div className="space-y-4">
      {metric && (
        <div className="rounded-lg bg-paper p-3 text-xs">
          <p className="font-semibold">{metric.title}</p>
          <p className="mt-1 text-ink-muted">
            {metric.kind === "region"
              ? "시군 전체 집계 · 학교 검색은 아래 목록에 적용됩니다."
              : "지도와 같은 학교별 지표를 표시합니다."}
          </p>
          {selectedSchool && metric.kind !== "region" && (
            <p className="mt-2">
              선택 학교:{" "}
              {chartValueText(metric.value(selectedSchool), metric.unit)}
            </p>
          )}
        </div>
      )}
      <button
        type="button"
        className="sr-only focus:not-sr-only focus:block focus:rounded focus:p-2"
        onClick={() => document.getElementById("school-map")?.focus()}
      >
        지도로 건너뛰기
      </button>
      <div className="space-y-3">
        <label className="block text-xs font-medium">
          학교명 검색
          <input
            type="search"
            value={filters.name}
            onChange={(event) =>
              onFilters({ ...filters, name: event.target.value })
            }
            placeholder="학교 이름을 입력하세요"
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm outline-none focus:border-accent"
          />
        </label>
        <label className="block text-xs font-medium">
          시군
          <select
            value={filters.regionCode ?? ""}
            onChange={(event) =>
              onFilters({ ...filters, regionCode: event.target.value || null })
            }
            className="mt-1.5 h-11 w-full rounded-lg border border-line bg-surface px-3 text-sm"
          >
            <option value="">{ACTIVE_PROFILE.province.shortName} 전체</option>
            {REGION_CODES.map((code) => (
              <option key={code} value={code}>
                {regionName(code)}
              </option>
            ))}
          </select>
        </label>
        <div
          role="group"
          aria-label="학교급 필터"
          className="flex flex-wrap gap-1.5"
        >
          {(["all", ...SCHOOL_LEVEL_ORDER] as const).map((level) => (
            <button
              type="button"
              key={level}
              aria-pressed={filters.level === level}
              onClick={() => onFilters({ ...filters, level })}
              className={`min-h-10 rounded-lg border px-3 text-xs ${filters.level === level ? "border-accent/40 bg-accent-soft font-semibold text-accent-text" : "border-line bg-surface text-ink-muted hover:bg-paper"}`}
            >
              {level === "all" ? "전체" : SCHOOL_LEVEL_LABELS[level]}
            </button>
          ))}
        </div>
      </div>
      {selectedSchool && (
        <SchoolDetail
          school={selectedSchool}
          onClose={() => onSelect(null)}
          onStatistics={onStatistics}
        />
      )}
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-xs text-ink-muted">
        <p aria-live="polite" data-testid="school-result-count">
          검색 결과 {schools.length}개 · 지도 표시 가능 {located}개
        </p>
        <button
          type="button"
          onClick={() =>
            onFilters({ name: "", level: "all", regionCode: null })
          }
          className="shrink-0 rounded px-1 py-2 underline"
        >
          초기화
        </button>
      </div>
      {schools.length === 0 ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          검색 조건에 맞는 학교가 없습니다.
        </p>
      ) : (
        <ul className="space-y-1" aria-label="학교 목록">
          {schools.map((school) => (
            <li key={school.id}>
              <button
                type="button"
                data-testid={`school-row-${school.id}`}
                aria-current={
                  school.id === selectedSchoolId ? "true" : undefined
                }
                onClick={() => onSelect(school.id)}
                className={`w-full rounded-lg border p-3 text-left ${school.id === selectedSchoolId ? "border-accent/40 bg-accent-soft" : "border-transparent hover:border-line hover:bg-paper"}`}
              >
                <span className="flex items-center gap-2">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{
                      backgroundColor: `rgb(${(metric ? metric.color(school).slice(0, 3) : SCHOOL_LEVEL_COLORS[school.level]).join(",")})`,
                    }}
                  />
                  <span className="text-sm font-medium">{school.name}</span>
                </span>
                <span className="mt-1.5 flex flex-wrap gap-x-2 gap-y-1 pl-[18px] text-xs text-ink-muted">
                  <span>
                    {regionName(school.regionCode as RegionCode)} ·{" "}
                    {SCHOOL_LEVEL_LABELS[school.level]}
                  </span>
                  <span>
                    {school.students === null
                      ? "학생수 자료 없음"
                      : `학생 ${school.students.toLocaleString("ko-KR")}명`}
                  </span>
                  {metric && metric.kind !== "region" && (
                    <span>
                      {metric.title}:{" "}
                      {chartValueText(metric.value(school), metric.unit)}
                    </span>
                  )}
                  {school.branch && <span>분교장</span>}
                  {school.small && (
                    <span className="text-warning-text">소규모</span>
                  )}
                  {school.lat === null && <span>위치 없음</span>}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
