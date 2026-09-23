import type { DataBundle } from "@/lib/data/types";
import { PROVINCE_CODE } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { deltaPrevYear, trend, valueMap } from "@/lib/stats";

/**
 * The 4 province-wide (52000) KPI tiles fixed by the task brief, in the
 * order it lists them: 학교수 / 학생수 / 교원수 / 소규모학교 수. Unrelated to
 * the map's selected indicator (URL `indicator` param) — these 4 are always
 * shown together regardless of what's selected in IndicatorMenu.
 *
 * Exported so TopBar.tsx can anchor its "기준 …" caption to THESE tiles'
 * own reference date (all 4 are KESS-sourced and share one referenceDate),
 * rather than the currently-selected map indicator's — Task 5 fix round 1
 * (coordinator ruling): those two only ever coincided by accident before
 * Task 5 introduced an indicator (폐교 지표) with a genuinely different
 * referenceDate.
 */
export const KPI_INDICATOR_IDS = ["schools_total", "students_total", "teachers_total", "small_schools"] as const;

export interface KpiTilesProps {
  indicators: DataBundle["indicators"];
  series: DataBundle["series"];
  manifest: DataBundle["manifest"];
}

function requireIndicator(id: string) {
  const def = indicatorById(id);
  if (!def) throw new Error(`KpiTiles: unknown indicator id "${id}"`);
  return def;
}

export default function KpiTiles({ indicators, series, manifest }: KpiTilesProps) {
  const latestYear = manifest.latestYear;

  return (
    <dl className="flex min-w-max items-center gap-2 lg:min-w-0">
      {KPI_INDICATOR_IDS.map((id) => {
        const def = requireIndicator(id);
        const file = indicators[id];
        const value = file ? valueMap(file).get(PROVINCE_CODE) ?? null : null;

        // Every KPI_INDICATOR_IDS entry is a sum/count aggregate (never
        // aggregate.kind === 'external'), so build-indicators.ts always
        // writes a series file for these 4 — but index into a
        // Record<string, SeriesFile> is still statically typed as
        // non-optional (no noUncheckedIndexedAccess), so this guards the
        // data contract rather than the type system.
        const seriesFile = series[id];
        const rows = seriesFile ? trend(seriesFile, PROVINCE_CODE) : [];
        const latestIdx = rows.findIndex((r) => r.year === latestYear);
        const prevYear = latestIdx > 0 ? rows[latestIdx - 1].year : null;
        const delta = seriesFile ? deltaPrevYear(seriesFile, PROVINCE_CODE, latestYear) : null;

        // Direction always shows both a symbol AND a color (never color
        // alone, per the brief's accessibility note). `isWarn` drives ONLY
        // `data-tone` below (an increase on a higherWorse-polarity indicator,
        // currently small_schools, is "warn"; everything else is "neutral")
        // — KpiTiles.test.tsx asserts data-tone directly, so this semantic
        // stays put (and its warn/neutral vocabulary is deliberately
        // narrower than the color's good/bad/muted one).
        //
        // The VISIBLE color (`deltaClass`) follows the indicator's POLARITY,
        // not the raw sign (spec §1, Task 1 review ruling): a change that is
        // good for the indicator (higherBetter ▲, higherWorse ▼) is teal
        // `text-positive-text`, a bad one (higherBetter ▼, higherWorse ▲) is
        // orange `text-warning-text`, and a neutral-polarity indicator (no
        // good/bad reading) or no/zero change is `text-ink-muted`. The
        // `*-text` variants are the darker small-text tokens (theme.ts) —
        // the plain `accent`/`positive` fills only clear 3:1 at this 10px.
        //
        // "—" (no arrow, no title) means no prior-year data exists at all
        // (delta === null: e.g. teachers_total's single-year fixture case).
        // "±0" (fix round 1) means a prior year DOES exist and the value is
        // unchanged (delta === 0) — a distinct, real fact from "no data",
        // so it gets its own symbol and an explanatory title rather than
        // collapsing into the same "—" the null case uses.
        const isWarn = delta !== null && delta > 0 && def.polarity === "higherWorse";
        const isGoodChange =
          delta !== null &&
          delta !== 0 &&
          ((def.polarity === "higherBetter" && delta > 0) || (def.polarity === "higherWorse" && delta < 0));
        const isBadChange =
          delta !== null &&
          delta !== 0 &&
          ((def.polarity === "higherBetter" && delta < 0) || (def.polarity === "higherWorse" && delta > 0));
        const deltaClass = isGoodChange ? "text-positive-text" : isBadChange ? "text-warning-text" : "text-ink-muted";
        const deltaText =
          delta === null ? "—" : delta === 0 ? "±0" : `${delta > 0 ? "▲" : "▼"} ${def.format(Math.abs(delta))}`;
        const deltaTitle = delta === 0 ? "전년과 동일" : undefined;

        return (
          <div
            key={id}
            data-testid={`kpi-tile-${id}`}
            title={prevYear !== null ? `${prevYear} → ${latestYear}` : undefined}
            className="flex h-14 min-w-36 flex-1 shrink-0 flex-col justify-center gap-0.5 rounded-md border border-line bg-surface px-3 shadow-[inset_2px_0_0_var(--color-accent)] lg:min-w-0"
          >
            <dt className="truncate text-[10px] text-ink-muted">{def.label}</dt>
            <dd
              data-testid={`kpi-value-${id}`}
              className="tabular-nums text-sm font-semibold text-ink"
            >
              {value === null ? "—" : def.format(value)}
            </dd>
            <dd
              data-testid={`kpi-delta-${id}`}
              data-tone={isWarn ? "warn" : "neutral"}
              title={deltaTitle}
              className={`tabular-nums text-[10px] ${deltaClass}`}
            >
              {deltaText}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}
