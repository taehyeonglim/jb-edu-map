"use client";

import { BarChart, CompositionChart } from "@/components/ui/AnalysisCharts";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile } from "@/lib/issues/types";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import { schoolDistribution } from "@/lib/analysis";
import { SCHOOL_LEVEL_COLORS, SCHOOL_LEVEL_LABELS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";
import { PROVINCE_CODE } from "@/lib/geo/regions";
import { THEME } from "@/lib/theme";

export default function MetricDetailCharts({ bundle, indicator, region, metric, facts }: {
  bundle: Pick<DataBundle, "schools" | "indicators">;
  indicator: string;
  region?: string | null;
  metric?: MapMetricSpec;
  facts?: EducationIssuesFile | null;
}) {
  const schools = bundle.schools.schools.filter(school => !region || school.regionCode === region);
  if (indicator === "schools_total") {
    const main = schools.filter(school => !school.branch);
    return <CompositionChart title="학교급 구성 · 본교 수" segments={SCHOOL_LEVEL_ORDER.map(level => ({ id: level, label: `${SCHOOL_LEVEL_LABELS[level]} · 개교`, value: main.filter(school => school.level === level).length, color: `rgb(${SCHOOL_LEVEL_COLORS[level].slice(0, 3).join(",")})` }))} note={`기준 ${bundle.schools.referenceDate.stats} · 분교 제외`} />;
  }
  if (metric && ["students_per_class", "students_per_teacher"].includes(indicator)) {
    return <BarChart title="학교별 값 분포" rows={schoolDistribution(schools, metric)} unit="개교" note={`${metric.date} · 지도와 동일한 전북 전체 기준 구간 · 초·중·고·특수, 분교 및 위치 없는 학교 포함`} />;
  }
  if (["special_classes", "special_students"].includes(indicator) && facts) {
    const field = indicator === "special_classes" ? "specialClasses" : "specialStudents";
    const unit = indicator === "special_classes" ? "학급" : "명";
    const sum = (special: boolean) => {
      const values = schools.filter(school => (school.level === "special") === special).map(school => facts.schools[school.id]?.[field] ?? null);
      return values.some(value => value === null) ? null : values.reduce<number>((n, value) => n + value!, 0);
    };
    return <BarChart title={`일반학교·특수학교 ${unit === "학급" ? "학급 수" : "학생 수"}`} unit={unit} rows={[
      { id: "regular", label: "일반학교 특수학급", value: sum(false), color: THEME.accent },
      { id: "special", label: "특수학교", value: sum(true), color: "rgb(176,185,255)" },
    ]} note={`기준 ${facts.statsReferenceDate} · 일반학교는 분교 포함 · 합계 ${bundle.indicators[indicator].rows.find(row => !row.level && row.regionCode === (region ?? PROVINCE_CODE))?.value?.toLocaleString("ko-KR") ?? "자료 없음"}${unit}`} />;
  }
  return null;
}
