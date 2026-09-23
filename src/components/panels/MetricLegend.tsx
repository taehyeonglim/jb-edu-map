"use client";

import { useState, type ReactNode } from "react";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import { ACTIVE_PROFILE } from "@/lib/profiles";

import { METRIC_RAMP } from "@/lib/mapMetrics";

export default function MetricLegend({
  metric,
  density,
  densityUnavailable = false,
  children,
  schoolSelected = false,
  selectedRegionSummary,
}: {
  metric: MapMetricSpec;
  density: boolean;
  densityUnavailable?: boolean;
  children?: ReactNode;
  schoolSelected?: boolean;
  selectedRegionSummary?: string;
}) {
  const [expanded, setExpanded] = useState(false);
  const legend = density
    ? METRIC_RAMP.map((color, i) => ({
        color,
        label: i === 0 ? "낮음" : i === METRIC_RAMP.length - 1 ? "높음" : "",
      }))
    : metric.legend;
  return (
    <section
      aria-label="선택 지표 범례"
      data-testid="metric-legend"
      data-map-obstacle="legend"
      data-school-selected={schoolSelected}
      className="cyber-legend cyber-frame pointer-events-auto p-3"
    >
      <div className="flex items-center justify-between gap-2">
      <h2
        data-testid="legend-indicator-label"
        className="text-sm font-semibold"
      >
        {metric.title}
      </h2>
      <button type="button" aria-label="범례 펼치기" aria-expanded={expanded} onClick={() => setExpanded((value) => !value)} className="min-h-11 min-w-11 border border-line px-2 text-xs text-accent-text lg:hidden">{expanded ? "접기 −" : "범례 +"}</button>
      </div>
      {selectedRegionSummary && <p className="mt-1 text-xs font-semibold text-accent-text">{selectedRegionSummary}</p>}
      <div className={`cyber-legend-body ${expanded ? "block" : "hidden lg:block"}`}>
      <p className="mt-1 text-xs text-ink-muted">
        {density
          ? "상대 집중도 · 낮음 → 높음"
          : metric.regionOverlay ? "시군 면: 학생 증감률 · 원: 작은학교" : metric.kind === "region"
            ? "시군 단위"
            : `학교 단위 · ${ACTIVE_PROFILE.province.shortName} 전체 기준`}
        <span className="block">{metric.date}</span>
      </p>
      <p className="mt-1 text-xs font-medium">{metric.summary}</p>
      <div className="mt-2 flex gap-1">
        {legend.map((item, i) => (
          <div key={i} className="min-w-0 flex-1">
            <div
              className="h-2 rounded-sm"
              style={{
                backgroundColor: `rgb(${item.color.slice(0, 3).join(",")})`,
              }}
            />
            <span className="break-words text-[10px] text-ink-muted">
              {item.label}
            </span>
          </div>
        ))}
      </div>
      {metric.proportional && <p className="mt-2 text-[11px] text-ink-muted">원 크기: 학교별 수치 · 최소 크기는 선택 편의를 위한 표시입니다.</p>}
      {metric.regionOverlay && <p className="mt-2 text-[11px] text-ink-muted">● 학생 60명 이하 본교 · 주황 테두리: 신입생 0명 강조 시</p>}
      {metric.specialEducation && <p className="mt-2 text-[11px] text-ink-muted">● 일반학교 특수학급 · ◆ 특수학교 (별도 집계)</p>}
      <p
        data-testid="legend-description"
        className="mt-2 hidden text-[11px] leading-relaxed text-ink-muted sm:block"
      >
        {metric.note}
      </p>
      <details className="pointer-events-auto mt-2 text-[11px] text-ink-muted sm:hidden">
        <summary>지도 읽는 법</summary>
        <p className="mt-1 leading-relaxed">{metric.note}</p>
      </details>
      {children}
      {densityUnavailable && (
        <p className="mt-1 text-[11px] text-ink-muted">
          이 기기에서는 학교별 수치로 표시합니다.
        </p>
      )}
      </div>
    </section>
  );
}
