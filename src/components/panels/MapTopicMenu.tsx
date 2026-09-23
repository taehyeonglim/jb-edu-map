"use client";
import { useMapQuery } from "@/lib/state/urlState";
import type { SeriesFile } from "@/lib/indicators/types";
import IndicatorMenu from "./IndicatorMenu";

const CHOICES = [
  ["학생 분포", "students_total"],
  ["교육여건", "students_per_class"],
  ["작은학교", "small_schools"],
  ["특수교육", "special-education"],
  ["지역 변화", "students_change_5y"],
] as const;

export default function MapTopicMenu({
  series, onExploreIssues,
}: {
  series: Record<string, SeriesFile>;
  onExploreIssues?: () => void;
}) {
  const query = useMapQuery();
  const active =
    query.issueId === "special-education"
      ? query.issueId
      : !query.issueId && CHOICES.some(([, id]) => id === query.indicatorId)
        ? query.indicatorId
        : "";
  const select = (id: string) =>
    id === "special-education" ? query.setIssue(id) : query.setIndicator(id);
  return (
    <div className="flex w-full min-w-0 items-center justify-between gap-1 sm:w-auto sm:gap-2">
      <select
        aria-label="교육현황 빠른 선택"
        value={active}
        onChange={(event) => select(event.target.value)}
        className="min-h-11 max-w-28 rounded-lg border border-line bg-surface px-2 text-xs xl:hidden"
      >
        <option value="" disabled>
          주제 선택
        </option>
        {CHOICES.map(([label, id]) => (
          <option key={id} value={id}>
            {label}
          </option>
        ))}
      </select>
      <nav aria-label="교육현황 빠른 선택" className="hidden gap-1 xl:flex">
        {CHOICES.map(([label, id]) => (
          <button
            key={id}
            aria-pressed={active === id}
            onClick={() => select(id)}
            className="min-h-11 rounded-lg px-3 text-sm hover:bg-paper aria-pressed:bg-accent-soft aria-pressed:text-accent-text"
          >
            {label}
          </button>
        ))}
      </nav>
      <IndicatorMenu series={series} />
      <button aria-label="교육문제 탐색" className="absolute right-3 top-2 min-h-11 shrink-0 rounded-lg bg-accent-soft px-2 text-xs font-semibold text-accent-text sm:static" onClick={() => { query.setView("issues"); onExploreIssues?.(); }}>교육문제<span className="hidden xl:inline"> 탐색</span></button>
    </div>
  );
}
