"use client";

import { makeColorScale } from "@/lib/colors";
import type { DataBundle } from "@/lib/data/types";
import { regionName } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { regionRankList } from "@/lib/selection";
import { displayLabel, rank, valueMap } from "@/lib/stats";
import { useMapQuery } from "@/lib/state/urlState";
import TimeSeriesChart from "@/components/ui/TimeSeriesChart";
import { PROVINCE_CODE } from "@/lib/geo/regions";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { trend } from "@/lib/stats";
import { BarChart } from "@/components/ui/AnalysisCharts";
import { shareNumerator } from "@/lib/analysis";
import { THEME } from "@/lib/theme";

export interface RegionListProps {
  bundle: Pick<DataBundle, "indicators" | "series">;
  showTrend?: boolean;
}

function rgbCss([r, g, b]: readonly number[]): string {
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The right panel's unselected state: every 시군, ranked by the current
 * indicator (largest value first), each a full-width button. Self-contained
 * like IndicatorMenu — reads `indicatorId` and writes `region` itself via
 * useMapQuery(), so Dashboard only needs to pass the loaded data bundle.
 */
export default function RegionList({ bundle, showTrend = true }: RegionListProps) {
  const { indicatorId, regionCode, setRegion, setIndicator } = useMapQuery();

  const def = indicatorById(indicatorId);
  if (!def) throw new Error(`RegionList: unknown indicatorId "${indicatorId}"`);

  const file = bundle.indicators[indicatorId];
  const map = valueMap(file);
  const label = displayLabel(def, bundle.series);
  const ranks = rank(map);
  const orderedCodes = regionRankList(map);
  const { colorOf } = makeColorScale(def, map);
  const trendId = indicatorId === "students_change_5y" ? "students_total" : indicatorId;
  const trendDef = indicatorById(trendId)!;
  const provinceTrend = bundle.series[trendId] ? trend(bundle.series[trendId], PROVINCE_CODE) : [];
  const province = map.get(PROVINCE_CODE);
  const denominators = bundle.indicators.schools_total ? valueMap(bundle.indicators.schools_total) : new Map<string, number | null>();
  const share = ["small_school_share", "rural_school_share"].includes(indicatorId);

  return (
    <div>
      <p className="mb-2 text-sm text-ink-muted">시군을 클릭하거나 목록에서 선택하세요</p>
      <BarChart title={`${label} · 시군 비교`} unit={def.unit} selectedId={regionCode ?? undefined} onSelect={code => setRegion(code as NonNullable<typeof regionCode>)}
        domain={share ? [0, 100] : undefined}
        reference={def.kind === "ratio" && province != null ? { value: province, label: `${ACTIVE_PROFILE.province.shortName} 전체 집계` } : undefined}
        rows={orderedCodes.map(code => {
          const value = map.get(code) ?? null;
          const denominator = denominators.get(code);
          const numerator = shareNumerator(value, denominator);
          return { id: code, label: regionName(code), value, text: value === null ? "자료 없음" : def.format(value), color: indicatorId === "students_change_5y" ? (value !== null && value < 0 ? THEME.warning : THEME.positive) : rgbCss(colorOf(code)), detail: share ? `대상 ${numerator ?? "자료 없음"}개교 / 본교 ${denominator ?? "자료 없음"}개교` : `${ranks.get(code) ?? "–"}위` };
        })}
        note={`기준 ${file.referenceDate} · 단위 ${def.unit} · 시군 전체 집계${share ? " · 학교 수는 반올림 전 비율과 본교 수로 산출" : ""}`} />
      {showTrend && <div className="mt-4">
        <TimeSeriesChart
          key={indicatorId}
          data={provinceTrend}
          label={trendDef.label}
          place={`${ACTIVE_PROFILE.province.shortName} 전체`}
          unit={trendDef.unit}
          format={trendDef.format}
          onShowStudents={indicatorId === "students_change_5y" ? () => setIndicator("students_total") : undefined}
        />
      </div>}
    </div>
  );
}
