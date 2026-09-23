"use client";

import { useState } from "react";
import { THEME } from "@/lib/theme";

export interface TimeSeriesPoint {
  year: number;
  value: number | null;
}

interface Props {
  data: TimeSeriesPoint[];
  label: string;
  place: string;
  unit: string;
  format: (value: number) => string;
  onShowStudents?: () => void;
}

const WIDTH = 320;
const HEIGHT = 126;
const LEFT = 12;
const RIGHT = 12;
const TOP = 14;
const BOTTOM = 22;

export default function TimeSeriesChart({ data, label, place, unit, format, onShowStudents }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const rows = [...data].sort((a, b) => a.year - b.year);
  const valid = rows.filter((row): row is { year: number; value: number } => row.value !== null);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const active = rows.find((row) => row.year === selectedYear) ?? last;
  const activeIndex = active ? rows.findIndex((row) => row.year === active.year) : -1;
  const previous = activeIndex > 0 ? rows[activeIndex - 1] : null;
  const delta = active?.value != null && previous?.value != null ? active.value - previous.value : null;
  const formatNumber = (value: number) => {
    const result = format(value);
    return unit && result.endsWith(unit) ? result.slice(0, -unit.length) : result;
  };
  const changeUnit = unit === "%" ? "%p" : unit;

  if (rows.length < 2 || valid.length < 2) {
    return <section aria-label={`${place} ${label} 시계열 추이`} className="cyber-frame p-3">
      <h3 className="text-sm font-semibold">시계열 추이 · {place}</h3>
      <p className="mt-2 text-xs text-ink-muted"><span>추이 없음</span> · 연도별 자료가 제공되지 않습니다.</p>
      {onShowStudents && <button type="button" onClick={onShowStudents} className="mt-2 min-h-11 text-xs font-semibold text-accent-text underline">학생수 연도별 추이 보기</button>}
    </section>;
  }

  const min = Math.min(...valid.map((row) => row.value));
  const max = Math.max(...valid.map((row) => row.value));
  const x = (year: number) => LEFT + ((year - first.year) / (last.year - first.year)) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => max === min ? (TOP + HEIGHT - BOTTOM) / 2
    : HEIGHT - BOTTOM - ((value - min) / (max - min)) * (HEIGHT - TOP - BOTTOM);
  const segments: { year: number; value: number }[][] = [];
  for (const [index, row] of rows.entries()) {
    if (row.value === null) continue;
    if (!segments.length || rows[index - 1]?.value === null)
      segments.push([]);
    segments[segments.length - 1].push({ year: row.year, value: row.value });
  }
  const aria = `${place} ${label} ${first.year}년부터 ${last.year}년까지의 추이`;

  return <section aria-label={`${place} ${label} 시계열 추이`} className="cyber-frame p-3">
    <h3 className="text-sm font-semibold">시계열 추이 · {place}</h3>
    <p className="mt-1 text-xs text-ink-muted">{label} · {first.year}–{last.year} · 연도를 눌러 값을 확인하세요</p>
    <svg role="img" aria-label={aria} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" className="mt-3 h-32 w-full" preserveAspectRatio="none">
      <line x1={LEFT} x2={WIDTH - RIGHT} y1={HEIGHT - BOTTOM} y2={HEIGHT - BOTTOM} stroke={THEME.line} />
      {segments.map((segment, index) => segment.length > 1 ? <path key={index} d={segment.map((row, point) => `${point ? "L" : "M"}${x(row.year)},${y(row.value)}`).join(" ")} fill="none" stroke={THEME.accent} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /> : null)}
      {valid.map((row) => <circle key={row.year} cx={x(row.year)} cy={y(row.value)} r={row.year === active?.year ? 5 : 3.5} fill={THEME.accent} stroke={THEME.paper} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      {rows.map((row) => <text key={row.year} x={x(row.year)} y={HEIGHT - 4} textAnchor="middle" fontSize="11" fill={THEME.inkMuted}>{row.year}</text>)}
    </svg>
    <p className="mt-1 text-sm font-semibold tabular-nums" aria-live="polite">
      {active.year}년 {active.value === null ? "자료 없음" : `${formatNumber(active.value)}${unit}`}
      {delta !== null && <span className="ml-2 text-xs font-normal text-ink-muted">전년 대비 {delta > 0 ? "+" : delta < 0 ? "−" : "±"}{formatNumber(Math.abs(delta))}{changeUnit}</span>}
    </p>
    <div className="mt-3 grid gap-1" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }} aria-label="연도별 값">
      {rows.map((row) => <button key={row.year} type="button" aria-pressed={row.year === active.year} onClick={() => setSelectedYear(row.year)} className="min-h-12 rounded border border-line bg-surface px-1 py-1 text-center text-xs aria-pressed:border-accent aria-pressed:bg-accent-soft">
        <span className="block text-ink-muted">{row.year}</span>
        <strong className="block truncate tabular-nums" title={row.value === null ? "자료 없음" : `${formatNumber(row.value)}${unit}`}>{row.value === null ? "—" : formatNumber(row.value)}</strong>
      </button>)}
    </div>
    <p className="mt-2 text-[11px] text-ink-muted">각 연도 교육통계 기준 값입니다. 빈 연도는 선으로 연결하지 않습니다.</p>
  </section>;
}
