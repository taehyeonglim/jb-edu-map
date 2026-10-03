export interface TimeSeriesPoint {
  year: number;
  value: number | null;
}

/** Include absent calendar years as null so gaps never become invented trends. */
export function alignSeries(
  data: TimeSeriesPoint[],
  comparison: TimeSeriesPoint[] = [],
) {
  const years = [...data, ...comparison].map((row) => row.year);
  if (!years.length) return { rows: [], other: [] };
  const start = Math.min(...years),
    end = Math.max(...years);
  const a = new Map(data.map((row) => [row.year, row.value]));
  const b = new Map(comparison.map((row) => [row.year, row.value]));
  const range = Array.from(
    { length: end - start + 1 },
    (_, index) => start + index,
  );
  return {
    rows: range.map((year) => ({ year, value: a.get(year) ?? null })),
    other: range.map((year) => ({ year, value: b.get(year) ?? null })),
  };
}

export function seriesSegments(
  rows: TimeSeriesPoint[],
): { year: number; value: number }[][] {
  const segments: { year: number; value: number }[][] = [];
  for (const [index, row] of rows.entries()) {
    if (row.value === null) continue;
    if (
      !segments.length ||
      rows[index - 1]?.value === null ||
      rows[index - 1]?.year !== row.year - 1
    )
      segments.push([]);
    segments[segments.length - 1].push({ year: row.year, value: row.value });
  }
  return segments;
}
