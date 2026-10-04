"use client";

import { useState } from "react";
import { THEME } from "@/lib/theme";

import { alignSeries, seriesSegments, type TimeSeriesPoint } from "@/lib/timeSeries";
export type { TimeSeriesPoint } from "@/lib/timeSeries";

interface Props {
  data: TimeSeriesPoint[];
  comparison?: { place: string; data: TimeSeriesPoint[] };
  label: string;
  place: string;
  unit: string;
  format: (value: number) => string;
  onShowStudents?: () => void;
}

const WIDTH = 380;
const HEIGHT = 170;
const LEFT = 64;
const RIGHT = 22;
const TOP = 24;
const BOTTOM = 26;

export default function TimeSeriesChart({ data, comparison, label, place, unit, format, onShowStudents }: Props) {
  const [selectedYear, setSelectedYear] = useState<number | null>(null);
  const { rows, other } = alignSeries(data, comparison?.data);
  const allRows = comparison ? [...rows, ...other] : rows;
  const valid = allRows.filter((row): row is { year: number; value: number } => row.value !== null);
  const first = rows[0];
  const last = rows[rows.length - 1];
  const active = rows.find((row) => row.year === selectedYear) ?? last;
  const activeIndex = active ? rows.findIndex((row) => row.year === active.year) : -1;
  const previous = activeIndex > 0 ? rows[activeIndex - 1] : null;
  const otherActive = other[activeIndex];
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

  const dataMin = Math.min(...valid.map((row) => row.value));
  const dataMax = Math.max(...valid.map((row) => row.value));
  const padding = (dataMax - dataMin || Math.abs(dataMax) || 1) * 0.1;
  const min = dataMin >= 0 ? Math.max(0, dataMin - padding) : dataMin - padding;
  const max = dataMax + padding;
  const ticks = Array.from({ length: 4 }, (_, index) => min + (max - min) * index / 3);
  const axisNumber = (value: number) => value.toLocaleString("ko-KR", { maximumFractionDigits: Math.abs(max - min) < 5 ? 2 : 1 });
  const x = (year: number) => LEFT + ((year - first.year) / (last.year - first.year)) * (WIDTH - LEFT - RIGHT);
  const y = (value: number) => max === min ? (TOP + HEIGHT - BOTTOM) / 2
    : HEIGHT - BOTTOM - ((value - min) / (max - min)) * (HEIGHT - TOP - BOTTOM);
  const series = [{ place, rows, color: THEME.accent, dashed: false }, ...(comparison ? [{ place: comparison.place, rows: other, color: THEME.warningText, dashed: true }] : [])];
  const aria = `${place} ${label} ${first.year}년부터 ${last.year}년까지의 추이`;

  return <section aria-label={`${place} ${label} 시계열 추이`} className="cyber-frame p-3">
    <h3 className="text-sm font-semibold">시계열 추이 · {place}</h3>
    <p className="mt-1 text-xs text-ink-muted">{label} · {first.year}–{last.year} · 연도를 눌러 값을 확인하세요</p>
    {comparison && <div className="mt-2 flex flex-wrap gap-3 text-xs" aria-label="추이 범례">{series.map((item, index) => <span key={index} style={{ color: item.color }}>{item.dashed ? "┄" : "━"} {item.place}</span>)}</div>}
    {min !== 0 && <p className="mt-1 text-[11px] text-ink-muted">세로축 확대 · {unit}</p>}
    <svg role="img" aria-label={`${aria} · 단위 ${unit}${min !== 0 ? " · 세로축 확대" : ""}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" className="mt-2 h-auto w-full">
      <text x={LEFT} y={12} fontSize="11" fill={THEME.inkMuted}>{unit}</text>
      {ticks.map((tick, index) => <g key={index}>
        <line x1={LEFT} x2={WIDTH - RIGHT} y1={y(tick)} y2={y(tick)} stroke={THEME.line} strokeDasharray="3 4" />
        <text x={LEFT - 7} y={y(tick) + 4} textAnchor="end" fontSize="11" fill={THEME.inkMuted}>{axisNumber(tick)}</text>
      </g>)}
      <line x1={LEFT} x2={WIDTH - RIGHT} y1={HEIGHT - BOTTOM} y2={HEIGHT - BOTTOM} stroke={THEME.line} />
      {series.map((item, index) => <g key={index} aria-label={item.place}>
        {seriesSegments(item.rows).map((segment, segmentIndex) => segment.length > 1 ? <path key={segmentIndex} d={segment.map((row, point) => `${point ? "L" : "M"}${x(row.year)},${y(row.value)}`).join(" ")} fill="none" stroke={item.color} strokeDasharray={item.dashed ? "5 4" : undefined} strokeWidth="2.5" vectorEffect="non-scaling-stroke" /> : null)}
        {item.rows.filter((row): row is { year: number; value: number } => row.value !== null).map(row => <circle key={row.year} cx={x(row.year)} cy={y(row.value)} r={row.year === active?.year ? 5 : 3.5} fill={item.color} stroke={THEME.paper} strokeWidth="2" vectorEffect="non-scaling-stroke" />)}
      </g>)}
      {rows.map((row) => <text key={row.year} x={x(row.year)} y={HEIGHT - 4} textAnchor="middle" fontSize="11" fill={THEME.inkMuted}>{row.year}</text>)}
    </svg>
    <p className="mt-1 text-sm font-semibold tabular-nums" aria-live="polite">
      {active.year}년 {comparison ? `${place} ` : ""}{active.value === null ? "자료 없음" : `${formatNumber(active.value)}${unit}`}
      {delta !== null && <span className="ml-2 text-xs font-normal text-ink-muted">전년 대비 {delta > 0 ? "+" : delta < 0 ? "−" : "±"}{formatNumber(Math.abs(delta))}{changeUnit}</span>}
    </p>
    {comparison && <p className="mt-1 text-xs tabular-nums">{comparison.place} {otherActive?.value == null ? "자료 없음" : `${formatNumber(otherActive.value)}${unit}`}</p>}
    <div className="mt-3 grid gap-1" aria-label="연도별 값">
      {rows.map((row, index) => <button key={row.year} type="button" aria-label={`${row.year} ${comparison ? `${place} ` : ""}${row.value === null ? "자료 없음" : `${formatNumber(row.value)}${unit}`}${comparison ? ` · ${comparison.place} ${other[index].value === null ? "자료 없음" : `${formatNumber(other[index].value)}${unit}`}` : ""}`} aria-pressed={row.year === active.year} onClick={() => setSelectedYear(row.year)} className="grid min-h-11 grid-cols-[3rem_1fr] items-center gap-2 rounded border border-line bg-surface px-2 py-2 text-left text-xs aria-pressed:border-accent aria-pressed:bg-accent-soft">
        <span className="text-ink-muted">{row.year}</span>
        <span className="flex flex-wrap justify-end gap-x-3 gap-y-1">
          <strong className="tabular-nums">{row.value === null ? "—" : `${formatNumber(row.value)}${unit}`}</strong>
          {comparison && <span className="tabular-nums" style={{ color: THEME.warningText }} title={comparison.place}>{other[index].value === null ? "—" : `${formatNumber(other[index].value)}${unit}`}</span>}
        </span>
      </button>)}
    </div>
    <p className="mt-2 text-[11px] text-ink-muted">각 연도 교육통계 기준 값입니다. 빈 연도는 선으로 연결하지 않습니다.</p>
  </section>;
}
