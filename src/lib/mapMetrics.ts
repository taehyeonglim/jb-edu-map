import type { School } from "./schools/types";
import type { DataBundle } from "./data/types";
import type { EducationIssuesFile, IssueMapModel } from "./issues/types";
import { schoolChartMetric } from "./schools/chart";
import { INDICATORS, indicatorById } from "./indicators/registry";
import { METRIC_LABELS } from "./issues/registry";
import { displayLabel, valueMap } from "./stats";
import { makeColorScale, paletteFor } from "./colors";
import { PROVINCE_CODE, REGION_CODES } from "./geo/regions";
import { ACTIVE_PROFILE } from "./profiles";
import { formatWithUnit } from "./tooltipText";

export type MetricColor = [number, number, number, number];
export type MapMetricKind = "density" | "value" | "category" | "region";
export interface MapMetricSpec {
  kind: MapMetricKind;
  title: string;
  unit: string;
  date: string;
  note: string;
  maximum: number;
  proportional?: boolean;
  regionOverlay?: boolean;
  summary: string;
  specialEducation: boolean;
  value: (school: School) => number | null;
  color: (school: School) => MetricColor;
  regionColor: (code: string) => MetricColor;
  legend: { label: string; color: MetricColor }[];
}

export const METRIC_RAMP: MetricColor[] = [
  [23, 75, 85, 255],
  [30, 108, 105, 255],
  [34, 143, 123, 255],
  [43, 185, 155, 255],
  [114, 229, 189, 255],
];
export const SPECIAL_RAMP: MetricColor[] = [
  [48, 58, 108, 255],
  [70, 87, 154, 255],
  [95, 116, 196, 255],
  [131, 152, 230, 255],
  [176, 185, 255, 255],
];
export const MISSING_COLOR: MetricColor = [96, 116, 134, 220];
export const ZERO_COLOR: MetricColor = [57, 79, 98, 230];
const number = (value: number) =>
  value.toLocaleString("ko-KR", { maximumFractionDigits: 1 });
const DENSITY_IDS = ["students_total", "classes_total", "teachers_total"];

export const SCHOOL_SIZE_COLORS: MetricColor[] = [
  [43, 185, 155, 255], [95, 160, 230, 255], [176, 185, 255, 255],
];
export const CONTEXT_SCHOOL_COLOR: MetricColor = [186, 204, 219, 140];
const SPECIAL_CLASS_BREAKS = [1, 2, 3, 10];
const SPECIAL_STUDENT_BREAKS = [5, 10, 20, 50];

/** Area is proportional above the shared minimum hit-target radius. */
export function metricRadius(value: number | null, maximum: number): number {
  return Math.max(5, 18 * Math.sqrt(Math.max(0, value ?? 0) / Math.max(1, maximum)));
}
export function metricReferenceValues(maximum: number): number[] {
  if (maximum <= 0) return [];
  const reference = (fraction: number) => Number.isInteger(maximum)
    ? Math.max(1, Math.round(maximum * fraction)) : maximum * fraction;
  return [...new Set([reference(0.25), reference(0.5), maximum])];
}
function schoolLabelTitle(metric: MapMetricSpec): string {
  return metric.regionOverlay ? "작은학교 학생수" : metric.title;
}
// Preload registered titles too, so switching metrics cannot rasterize new glyphs
// before the font gate finishes loading an additional font subset.
const SCHOOL_LABEL_VOCABULARY = INDICATORS.map((metric) => `${metric.label}${metric.unit}`).join("")
  + Object.values(METRIC_LABELS).join("") + "작은학교 학생수 특수학교 포함 자료 없음 해당0123456789,. /·−-→";
/** Include runtime label vocabulary in both font loading and the SDF atlas. */
export function metricSchoolLabelCharset(metric: MapMetricSpec): string {
  return Array.from(new Set(`${SCHOOL_LABEL_VOCABULARY}${schoolLabelTitle(metric)}${metric.title}${metric.unit}`)).join("");
}
export function metricSchoolLabel(metric: MapMetricSpec, school: School): string {
  if (metric.kind === "region") return school.name;
  const value = metric.value(school);
  const text = value === null || !Number.isFinite(value) ? "자료 없음"
    : metric.kind === "category" ? value > 0 ? "해당" : "해당 없음"
    : `${number(value)}${metric.unit}`;
  return `${school.name}\n${schoolLabelTitle(metric)} ${text}`;
}


/** One unfiltered province-wide scale shared by points, columns and the legend. */
export function buildMapMetric(
  bundle: DataBundle,
  indicator: string,
  issue: IssueMapModel | null | undefined,
  facts?: EducationIssuesFile | null,
): MapMetricSpec {
  const def = indicatorById(indicator);
  if (!def) throw new Error(`Unknown map indicator: ${indicator}`);
  const metric = schoolChartMetric(indicator, issue?.metric, facts);
  const value = metric?.value ?? (() => null);
  const population =
    issue?.metric === "school-size" ? issue.schools :
    issue && ["special-classes", "special-students"].includes(issue.metric)
      ? bundle.schools.schools.filter((s) => s.level !== "special")
      : bundle.schools.schools;
  const values = population.map(value);
  const maximum = Math.max(
    0,
    ...values.filter((v): v is number => v !== null && Number.isFinite(v)),
  );
  const kind: MapMetricKind = !metric
    ? "region"
    : metric.heightMode
      ? "category"
      : !issue && DENSITY_IDS.includes(indicator)
        ? "density"
        : "value";
  const specialEducation =
    issue?.issue.id === "special-education" ||
    (!issue && ["special_classes", "special_students"].includes(indicator));
  const title =
    issue?.title ??
    `${displayLabel(def, bundle.series)}${specialEducation ? " · 특수학교 포함" : ""}`;
  const unit = metric?.unit ?? def.unit;
  const map = valueMap(bundle.indicators[indicator]);
  const regional = makeColorScale(def, map);
  const ramp = specialEducation ? SPECIAL_RAMP : METRIC_RAMP;
  const specialBreaks = specialEducation && kind === "value"
    ? (unit === "학급" ? SPECIAL_CLASS_BREAKS : SPECIAL_STUDENT_BREAKS) : null;
  const categoryColor: MetricColor = specialEducation
    ? [176, 185, 255, 255]
    : indicator === "schools_total" && !issue
      ? [67, 207, 224, 255]
      : [242, 140, 98, 255];
  const color = (school: School): MetricColor => {
    if (issue?.metric === "ai-focus-schools") return [95, 160, 230, 255];
    if (issue?.metric === "school-size") {
      const n = school.students;
      return n === null ? MISSING_COLOR : n === 0 ? ZERO_COLOR : n <= 60 ? SCHOOL_SIZE_COLORS[0] : n >= 1000 ? SCHOOL_SIZE_COLORS[2] : SCHOOL_SIZE_COLORS[1];
    }
    if (kind === "region") return MISSING_COLOR;
    const v = value(school);
    if (v === null || !Number.isFinite(v)) return MISSING_COLOR;
    if (v === 0) return ZERO_COLOR;
    if (kind === "category") return categoryColor;
    if (specialBreaks) return ramp[specialBreaks.filter((end) => v > end).length];
    return ramp[Math.min(4, Math.floor((v / Math.max(1, maximum)) * 5))];
  };

  const change = !issue && indicator === "students_change_5y";
  const extent = Math.max(
    1,
    ...REGION_CODES.map((code) => Math.abs(map.get(code) ?? 0)),
  );
  const changeColor = (v: number): MetricColor => {
    const end = v < 0 ? [242, 140, 98] : [114, 229, 189];
    return [
      ...end.map((c, i) => Math.round([48, 58, 82][i] + ((c - [48, 58, 82][i]) * Math.abs(v)) / extent)),
      170,
    ] as MetricColor;
  };
  const regionColor = (code: string): MetricColor => {
    if (issue)
      return issue.regions.find((r) => r.code === code)?.color ?? MISSING_COLOR;
    const v = map.get(code);
    if (v == null) return MISSING_COLOR;
    if (change) return changeColor(v);
    return [...regional.colorOf(code).slice(0, 3), 165] as MetricColor;
  };

  let legend: MapMetricSpec["legend"];
  if (kind === "region") {
    const palette = paletteFor(def.polarity);
    legend =
      issue?.legend ??
      (change
        ? [-extent, 0, extent].map((v) => ({
            label: `${number(v)}%`,
            color: changeColor(v),
          }))
        : regional.ticks.slice(0, -1).flatMap((v, i) => {
            const low = def.kind === "count" ? Math.ceil(v) : v;
            const high = def.kind === "count"
              ? i === regional.ticks.length - 2 ? Math.floor(regional.ticks[i + 1]) : Math.ceil(regional.ticks[i + 1]) - 1
              : regional.ticks[i + 1];
            return low > high ? [] : [{
              label: `${number(low)}${low === high ? "" : `–${number(high)}`}${unit}`,
              color: [...palette[i], 165] as MetricColor,
            }];
          }));
  } else if (kind === "category") {
    legend = [
      { label: "해당 학교", color: categoryColor },
      { label: "해당 없음", color: ZERO_COLOR },
    ];
  } else {
    const integerCounts = kind === "density" || specialEducation;
    legend = ramp.flatMap((c, i) => {
      const low = integerCounts
        ? Math.max(1, Math.ceil((maximum * i) / 5))
        : (maximum * i) / 5;
      const high = integerCounts
        ? i === 4
          ? maximum
          : Math.ceil((maximum * (i + 1)) / 5) - 1
        : (maximum * (i + 1)) / 5;
      return low > high || maximum === 0 ? [] : [{ label: `${!integerCounts && i === 0 ? "0 초과" : number(low)}${low === high ? "" : `–${number(high)}`}${unit}`, color: c }];
    });
    legend = [...legend, { label: "0", color: ZERO_COLOR }];
  }
  if (
    kind === "value" &&
    !specialBreaks &&
    maximum <= 5 &&
    maximum > 0 &&
    values.every((v) => v === null || Number.isInteger(v))
  ) {
    legend = Array.from({ length: maximum }, (_, i) => ({
      label: `${i + 1}${unit}`,
      color: ramp[Math.min(4, Math.floor(((i + 1) / maximum) * 5))],
    }));
    legend.push({ label: "0", color: ZERO_COLOR });
  }
  if (specialBreaks) {
    legend = ramp.map((color, i) => {
      const low = i === 0 ? 1 : specialBreaks[i - 1] + 1;
      const high = specialBreaks[i];
      return { color, label: high === undefined ? `${low}${unit} 이상`
        : low === high ? `${low}${unit}` : `${low}–${high}${unit}` };
    });
    legend.push({ label: "0", color: ZERO_COLOR });
  }
  const hasMissing =
    kind === "region"
      ? issue
        ? issue.regions.some((r) => r.value === null)
        : REGION_CODES.some((code) => map.get(code) == null)
      : values.some((v) => v === null || !Number.isFinite(v));
  if (hasMissing && !legend.some((item) => item.label === "자료 없음")) {
    legend = [...legend, { label: "자료 없음", color: MISSING_COLOR }];
  }
  const note =
    issue?.note ??
    (kind === "density"
      ? "학교 위치를 기준으로 한 분포입니다. 거주지나 통학권을 뜻하지 않습니다."
      : kind === "region"
        ? `시군 전체 집계 · 학교별 값으로 배분하지 않습니다.${regional.colorBuckets === "quantile" && !change ? " 색 구간: 고유값 5분위." : ""}`
        : kind === "category"
          ? "본교 기준 · 분교 제외. 학교수는 해당 여부로 표시합니다."
          : specialEducation
            ? "일반학교 특수학급과 특수학교를 포함한 집계 · ◆ 특수학교"
            : `${ACTIVE_PROFILE.province.shortName} 전체 학교 기준 · 밝은 색은 큰 값이며 적정·과밀 판정이 아닙니다.`);
  if (issue?.metric === "school-size") legend = [
    { label: "1~60명", color: SCHOOL_SIZE_COLORS[0] },
    { label: "61~999명", color: SCHOOL_SIZE_COLORS[1] },
    { label: "1,000명 이상", color: SCHOOL_SIZE_COLORS[2] },
    { label: "0명 (60명 이하에 포함)", color: ZERO_COLOR },
    { label: "자료 없음", color: MISSING_COLOR },
  ];
  if (issue?.regionOverlay) legend = issue.legend;
  const province = map.get(PROVINCE_CODE);
  const summary =
    issue?.provinceText ??
    `${ACTIVE_PROFILE.province.shortName} 전체 ${province == null ? "자료 없음" : formatWithUnit(def, province)}`;
  return {
    kind,
    proportional: issue?.metric === "school-size" || (issue?.issue.id === "special-education" && issue.metric !== "special-schools"),
    regionOverlay: issue?.regionOverlay,
    title,
    unit,
    maximum,
    summary,
    value,
    color,
    regionColor,
    legend,
    specialEducation,
    date: issue?.date ?? `기준 ${bundle.indicators[indicator].referenceDate}`,
    note,
  };
}
