"use client";

import { useState, type ReactNode } from "react";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import { ACTIVE_PROFILE } from "@/lib/profiles";

import { CONTEXT_SCHOOL_COLOR, METRIC_RAMP } from "@/lib/mapMetrics";

export default function MetricLegend({
  metric,
  density,
  densityUnavailable = false,
  mode,
  sizeSamples,
  contextualSchools = false,
  children,
  schoolSelected = false,
  selectedRegionSummary,
}: {
  metric: MapMetricSpec;
  density: boolean;
  densityUnavailable?: boolean;
  mode?: "density" | "points" | "columns" | "region";
  sizeSamples?: { value: number; size: number }[];
  contextualSchools?: boolean;
  children?: ReactNode;
  schoolSelected?: boolean;
  selectedRegionSummary?: string;
}) {
  const renderedMode = mode ?? (density ? "density" : metric.kind === "region" ? "region" : "points");
  const [expanded, setExpanded] = useState(false);
  const legend = renderedMode === "density"
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
        {renderedMode === "density"
          ? "상대 집중도 · 낮음 → 높음"
          : metric.regionOverlay ? "시군 면: 학생 증감률 · 원: 작은학교" : metric.kind === "region"
            ? "시군 단위"
            : `학교 단위 · ${renderedMode === "columns" ? "원통" : "점"} · ${ACTIVE_PROFILE.province.shortName} 전체 기준`}
        <span className="block">{metric.date}</span>
      </p>
      <p className="mt-1 text-xs font-medium">{metric.summary}</p>
      <div className={renderedMode === "density" ? "mt-2 flex gap-1" : "mt-2 grid grid-cols-2 gap-x-3 gap-y-2"}>
        {legend.map((item, i) => (
          <div key={i} className={renderedMode === "density" ? "min-w-0 flex-1" : "flex min-w-0 items-start gap-2"}>
            <div
              className={renderedMode === "density" ? "h-2 rounded-sm" : "mt-0.5 h-3 w-3 shrink-0 rounded-sm"}
              style={{
                backgroundColor: `rgb(${item.color.slice(0, 3).join(",")})`,
              }}
            />
            <span className={renderedMode === "density" ? "text-[10px] text-ink-muted" : "break-keep text-[11px] leading-4 tabular-nums text-ink-muted"}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
      {!!sizeSamples?.length && (
        <div className="mt-3 border-t border-line pt-2" data-testid="metric-size-legend">
          <p className="text-[11px] text-ink-muted">{renderedMode === "columns" ? "높이 비교 · 값에 정비례" : "원 면적 · 학교별 수치"}</p>
          <div className="mt-2 flex items-end justify-around gap-2">
            {sizeSamples.map(({ value, size }) => (
              <div key={value} className="flex flex-col items-center gap-1 text-[10px] text-ink-muted">
                <span aria-hidden="true" className="border border-accent bg-accent/20" style={renderedMode === "columns"
                  ? { width: 12, height: size }
                  : { width: size * 2, height: size * 2, borderRadius: "50%" }} />
                <span>{value.toLocaleString("ko-KR", { maximumFractionDigits: 1 })}{metric.unit}</span>
              </div>
            ))}
          </div>
          {renderedMode !== "columns" && <p className="mt-1 text-[11px] text-ink-muted">최소 원 크기는 선택 편의를 위한 표시입니다.</p>}
        </div>
      )}
      {contextualSchools && <p className="mt-2 text-[11px] text-ink-muted"><span style={{ color: `rgb(${CONTEXT_SCHOOL_COLOR.slice(0, 3).join(",")})` }}>○</span> 학교 위치 · 선택 지표의 학교별 값이 아닙니다.</p>}
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
