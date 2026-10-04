import type { MapMetricSpec } from "./mapMetrics";
import type { School } from "./schools/types";

/** Use exactly the map's color classification, with zero and unavailable bins intact. */
export function schoolDistribution(schools: School[], metric: MapMetricSpec) {
  if (metric.kind === "region") return [];
  const bins = metric.legend.map((entry, index) => ({ id: String(index), label: entry.label, value: 0, color: `rgb(${entry.color.slice(0, 3).join(",")})`, key: entry.color.join(",") }));
  for (const school of schools) {
    const key = metric.color(school).join(",");
    const bin = bins.find(entry => entry.key === key);
    if (bin) bin.value++;
  }
  return bins;
}

/** Recover integer share counts only when the unrounded share uniquely reproduces them. */
export function shareNumerator(share: number | null | undefined, denominator: number | null | undefined): number | null {
  if (share == null || denominator == null || denominator <= 0 || !Number.isFinite(share) || !Number.isFinite(denominator)) return null;
  const count = share * denominator / 100;
  const integer = Math.round(count);
  return Math.abs(count - integer) < 1e-7 && integer >= 0 && integer <= denominator ? integer : null;
}
