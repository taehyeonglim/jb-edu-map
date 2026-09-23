"use client";

import { useLayoutEffect, useRef, useState } from "react";
import type { WebMercatorViewport } from "@deck.gl/core";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import type { School } from "@/lib/schools/types";
import { chartValueText } from "@/lib/schools/chart";
import { regionName, type RegionCode } from "@/lib/geo/regions";
import { SCHOOL_LEVEL_LABELS } from "@/lib/schoolVisuals";
import { placeSchoolHud, type HudRect } from "./useHudLayout";

export default function SchoolHud({
  school,
  viewport,
  metric,
  onClose,
  onStatistics,
  obstacles = [],
}: {
  school: School;
  viewport: WebMercatorViewport;
  metric: MapMetricSpec;
  onClose: () => void;
  onStatistics?: (code: RegionCode) => void;
  obstacles?: HudRect[];
}) {
  const cardRef = useRef<HTMLElement>(null);
  const [height, setHeight] = useState(228);
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    const measure = () => setHeight(card.scrollHeight + 2);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(card);
    return () => observer.disconnect();
  }, [school.id]);

  if (school.lng === null || school.lat === null) return null;
  const point = viewport.project([school.lng, school.lat]) as [number, number];
  const offscreen = point[0] < 0 || point[0] > viewport.width || point[1] < 0 || point[1] > viewport.height;
  const width = Math.min(viewport.width - 24, 304);
  const position = placeSchoolHud(point, viewport, { width, height }, obstacles);
  const number = (value: number | null, unit: string) => value === null ? "자료 없음" : `${value.toLocaleString("ko-KR")}${unit}`;
  const metricValue = metric.kind !== "region" ? metric.value(school) : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20" style={{ visibility: offscreen ? "hidden" : undefined }} data-testid="school-hud-anchor">
      <svg className="absolute inset-0 h-full w-full overflow-visible" aria-hidden="true">
        <line x1={point[0]} y1={point[1]} x2={position.stemX} y2={position.stemY} stroke="var(--color-accent)" strokeWidth="1.5" />
        <circle cx={point[0]} cy={point[1]} r="12" fill="none" stroke="var(--color-accent)" strokeWidth="1" />
        <circle cx={point[0]} cy={point[1]} r="3" fill="var(--color-accent)" />
      </svg>
      <section
        ref={cardRef}
        aria-label="선택한 학교"
        data-testid="school-hud"
        className="cyber-frame cyber-hud pointer-events-auto absolute overflow-y-auto p-3 text-ink"
        style={{ left: position.left, top: position.top, width: position.width, maxHeight: position.height }}
      >
        <div className="flex items-start justify-between gap-2 border-b border-accent/25 pb-2">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold tracking-[0.12em] text-accent">학교 현황 / {SCHOOL_LEVEL_LABELS[school.level]}</p>
            <h2 className="mt-1 text-base font-bold leading-snug">{school.name}</h2>
            <p className="mt-0.5 text-xs text-ink-muted">{regionName(school.regionCode as RegionCode)} · {school.status}</p>
          </div>
          <button type="button" aria-label="학교 HUD 닫기" onClick={onClose} className="min-h-11 min-w-11 rounded border border-line text-ink-muted hover:bg-accent-soft hover:text-ink">✕</button>
        </div>
        <dl className="mt-3 grid grid-cols-3 gap-2">
          {([
            ["학생", school.students, "명"],
            ["학급", school.classes, "개"],
            ["교원", school.teachers, "명"],
          ] as const).map(([label, value, unit]) => (
            <div key={label} className="rounded-md border border-line/70 bg-surface/65 px-2 py-2">
              <dt className="text-[10px] text-ink-muted">{label}</dt>
              <dd className="mt-1 text-sm font-bold tabular-nums text-ink">{number(value, unit)}</dd>
            </div>
          ))}
        </dl>
        {metric.kind !== "region" && (
          <div className="mt-2 flex items-baseline justify-between gap-2 rounded-md border border-accent/25 bg-accent-soft/45 px-2 py-1.5 text-xs">
            <span className="truncate text-ink-muted">{metric.title}</span>
            <strong className="shrink-0 tabular-nums text-accent">{chartValueText(metricValue, metric.unit)}</strong>
          </div>
        )}
        {(school.small || school.branch) && <p className="mt-2 text-[11px] text-warning-text">{[school.small && "소규모학교", school.branch && "분교장"].filter(Boolean).join(" · ")}</p>}
        {school.locationSource && (
          <div className="mt-2 text-[11px] leading-relaxed text-ink-muted">
            <p>{school.locationSource.address}</p>
            <a href={school.locationSource.url} target="_blank" rel="noopener noreferrer" aria-label="학교 공식 위치 안내" className="text-accent underline underline-offset-2">학교 공식 위치 안내 ↗</a>
            <span> · 확인 {school.locationSource.verifiedAt}</span>
          </div>
        )}
        {onStatistics && <button type="button" onClick={() => onStatistics(school.regionCode as RegionCode)} className="mt-2 block min-h-9 text-xs font-semibold text-accent underline underline-offset-2">해당 시군 통계 보기</button>}
      </section>
    </div>
  );
}
