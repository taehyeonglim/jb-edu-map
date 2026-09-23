"use client";

import { INDICATORS } from "@/lib/indicators/registry";
import { GROUP_ORDER, GROUP_LABELS } from "@/lib/indicators/groups";
import { useMapQuery } from "@/lib/state/urlState";

/** Every map metric is one click away; the registry remains the source of truth. */
export default function MetricCommandRail() {
  const query = useMapQuery();
  return (
    <nav aria-label="전체 지도 지표" className="cyber-metric-rail">
      {GROUP_ORDER.flatMap((group) => INDICATORS.filter((item) => item.group === group).map((item) => (
        <button
          key={item.id}
          type="button"
          title={`${GROUP_LABELS[group]} · ${item.description}`}
          aria-pressed={!query.issueId && query.indicatorId === item.id}
          onClick={() => query.setIndicator(item.id)}
          className="border border-line bg-surface px-2 text-ink-muted aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-text"
        >
          {item.label}
        </button>
      )))}
    </nav>
  );
}
