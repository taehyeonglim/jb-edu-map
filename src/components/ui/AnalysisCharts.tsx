"use client";

import { THEME } from "@/lib/theme";

export interface BarRow {
  id: string;
  label: string;
  value: number | null;
  text?: string;
  color?: string;
  detail?: string;
}

const number = (n: number) => n.toLocaleString("ko-KR", { maximumFractionDigits: 1 });

/** A common, zero-based scale, with the exact value always visible outside the mark. */
export function BarChart({ title, rows, unit = "", reference, domain, selectedId, onSelect, note }: {
  title: string;
  rows: BarRow[];
  unit?: string;
  reference?: { value: number; label: string };
  domain?: [number, number];
  selectedId?: string;
  onSelect?: (id: string) => void;
  note?: string;
}) {
  const values = rows.flatMap(row => row.value !== null && Number.isFinite(row.value) ? [row.value] : []);
  if (reference && Number.isFinite(reference.value)) values.push(reference.value);
  const lo = Math.min(0, domain?.[0] ?? 0, ...values);
  const hi = Math.max(0, domain?.[1] ?? 0, ...values);
  const span = hi - lo || 1;
  const position = (value: number) => (value - lo) / span * 100;
  const rowValue = (row: BarRow) => row.text ?? (row.value === null ? "자료 없음" : `${number(row.value)}${unit}`);
  const content = (row: BarRow) => <>
    <span className="flex items-start justify-between gap-3 text-xs">
      <span className="min-w-0 text-left">{row.label}</span>
      <span className="shrink-0 text-right tabular-nums">{rowValue(row)}</span>
    </span>
    <span aria-hidden="true" className="relative mt-1.5 block h-2.5 rounded-sm bg-ink/5">
      <span className="absolute -top-1 bottom-[-4px] w-px bg-ink-muted/50" style={{ left: `${position(0)}%` }} />
      {reference && <span className="absolute -top-1 bottom-[-4px] z-10 border-l border-dashed border-ink" style={{ left: `${position(reference.value)}%` }} />}
      {row.value !== null && Number.isFinite(row.value) && <span className="absolute inset-y-0 rounded-sm" style={{ left: `${Math.min(position(0), position(row.value))}%`, width: `${Math.abs(row.value) / span * 100}%`, backgroundColor: row.color ?? (row.value < 0 ? THEME.warning : THEME.accent) }} />}
    </span>
    {row.detail && <span className="mt-1 block text-left text-[11px] text-ink-muted">{row.detail}</span>}
  </>;
  return <section aria-label={title} className="analysis-chart cyber-frame p-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    {reference && <p className="mt-1 text-xs text-ink-muted">┆ {reference.label} {number(reference.value)}{unit}</p>}
    <div aria-hidden="true" className="relative mt-2 flex justify-between text-[11px] tabular-nums text-ink-muted"><span>{number(lo)}{unit}</span>{lo < 0 && hi > 0 && <span className="absolute -translate-x-1/2" style={{ left: `${position(0)}%` }}>0</span>}<span>{number(hi)}{unit}</span></div>
    <ul className="mt-1 space-y-1">
      {rows.map(row => <li key={row.id}>{onSelect ? <button type="button" aria-label={[row.label, rowValue(row), row.detail].filter(Boolean).join(" ")} aria-pressed={selectedId === row.id} onClick={() => onSelect(row.id)} className="analysis-bar-row block w-full rounded border border-transparent px-2 py-2 hover:bg-ink/5 aria-pressed:border-accent aria-pressed:bg-accent-soft">{content(row)}</button> : <div className="analysis-bar-row px-1 py-2">{content(row)}</div>}</li>)}
    </ul>
    {rows.length === 0 && <p className="mt-3 text-xs text-ink-muted">해당 조건의 자료가 없습니다.</p>}
    {note && <p className="mt-3 text-xs leading-relaxed text-ink-muted">{note}</p>}
  </section>;
}

export interface CompositionSegment { id: string; label: string; value: number; color: string }

export function CompositionChart({ title, segments, note }: { title: string; segments: CompositionSegment[]; note?: string }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  return <section aria-label={title} className="analysis-chart cyber-frame p-3">
    <h3 className="text-sm font-semibold">{title}</h3>
    {total > 0 ? <div role="img" aria-label={segments.map(segment => `${segment.label} ${number(segment.value)}, ${(segment.value / total * 100).toFixed(1)}%`).join(" · ")} className="mt-3 flex h-5 overflow-hidden rounded-sm bg-ink/5">
      {segments.map(segment => <span key={segment.id} style={{ width: `${segment.value / total * 100}%`, backgroundColor: segment.color }} />)}
    </div> : <p className="mt-3 text-xs text-ink-muted">해당 조건의 대상이 없습니다.</p>}
    <ul className="mt-3 space-y-2 text-xs">
      {segments.map(segment => <li key={segment.id} className="flex items-start justify-between gap-2">
        <span className="flex items-start gap-2"><span aria-hidden="true" className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: segment.color }} />{segment.label}</span>
        <span className="shrink-0 tabular-nums">{number(segment.value)}{total > 0 ? ` · ${(segment.value / total * 100).toFixed(1)}%` : ""}</span>
      </li>)}
    </ul>
    {note && <p className="mt-3 text-xs leading-relaxed text-ink-muted">{note}</p>}
  </section>;
}
