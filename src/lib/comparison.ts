import type { DataBundle } from "./data/types";
import type { RegionCode } from "./geo/regions";
import { GROUP_LABELS, GROUP_ORDER } from "./indicators/groups";
import { INDICATORS } from "./indicators/registry";
import {
  buildIssueModel,
  formatIssueValue,
  isResourceMetric,
  issueValue,
} from "./issues/model";
import { METRIC_LABELS } from "./issues/registry";
import type { EducationIssuesFile, IssueMapModel } from "./issues/types";
import { displayLabel, valueMap } from "./stats";
import { formatWithUnit } from "./tooltipText";

export interface ComparisonRow {
  id: string;
  group: string;
  label: string;
  unit: string;
  values: [number | string | null, number | string | null];
  texts: [string, string];
  difference: number | null;
  differenceText: string;
  differenceUnit: string;
  referenceDate: string;
  source: string;
  sourceUrl: string;
  note: string;
}

function differenceFields(
  a: number | string | null,
  b: number | string | null,
  unit: string,
  format: (value: number) => string,
  categorical = false,
) {
  const difference =
    !categorical && typeof a === "number" && typeof b === "number"
      ? a - b
      : null;
  const differenceUnit = unit === "%" ? "%p" : unit;
  const magnitude = difference === null ? "" : format(Math.abs(difference));
  const number =
    unit && magnitude.endsWith(unit)
      ? magnitude.slice(0, -unit.length)
      : magnitude;
  return {
    difference,
    differenceUnit,
    differenceText:
      difference === null
        ? categorical
          ? "비교 불가"
          : "자료 없음"
        : `${difference > 0 ? "+" : difference < 0 ? "−" : "±"}${number}${differenceUnit}`,
  };
}

export function buildIndicatorComparison(
  bundle: Pick<DataBundle, "indicators" | "series">,
  region: RegionCode,
  compare: RegionCode,
): ComparisonRow[] {
  return GROUP_ORDER.flatMap((group) =>
    INDICATORS.filter((def) => def.group === group).map((def) => {
      const file = bundle.indicators[def.id];
      const values = valueMap(file);
      const a = values.get(region) ?? null,
        b = values.get(compare) ?? null;
      return {
        id: def.id,
        group: GROUP_LABELS[group],
        label: displayLabel(def, bundle.series),
        unit: def.unit,
        values: [a, b] as ComparisonRow["values"],
        texts: [
          a === null ? "자료 없음" : formatWithUnit(def, a),
          b === null ? "자료 없음" : formatWithUnit(def, b),
        ] as [string, string],
        ...differenceFields(a, b, def.unit, def.format),
        referenceDate: file.referenceDate,
        source: file.source.name,
        sourceUrl: file.source.url,
        note: [def.description, def.caveat].filter(Boolean).join(" "),
      };
    }),
  );
}

function issueUnit(metric: string): string {
  if (["designation", "career-regions"].includes(metric)) return "";
  if (
    ["student-change", "decline-small", "small-share", "unused-share"].includes(
      metric,
    )
  )
    return "%";
  if (metric === "unused-count") return "건";
  if (metric === "special-classes") return "학급";
  if (metric === "special-students") return "명";
  return isResourceMetric(metric) && metric !== "ai-focus-schools"
    ? "곳"
    : "개교";
}

export function buildIssueComparison(
  bundle: DataBundle,
  data: EducationIssuesFile,
  model: IssueMapModel,
  region: RegionCode,
  compare: RegionCode,
): ComparisonRow[] {
  return model.issue.metrics.map((metric) => {
    const metricModel = buildIssueModel(
      bundle,
      data,
      model.issue,
      metric,
      model.level,
    );
    const a = issueValue(bundle, data, metric, region, model.level),
      b = issueValue(bundle, data, metric, compare, model.level);
    const unit = issueUnit(metric);
    return {
      id: metric,
      group: model.issue.title,
      label: METRIC_LABELS[metric],
      unit,
      values: [a, b],
      texts: [formatIssueValue(metric, a), formatIssueValue(metric, b)],
      ...differenceFields(
        a,
        b,
        unit,
        (value) =>
          unit === "%" ? value.toFixed(1) : value.toLocaleString("ko-KR"),
        ["designation", "career-regions"].includes(metric),
      ),
      referenceDate: metricModel.date,
      source: metricModel.sources.map((source) => source.name).join(" | "),
      sourceUrl: metricModel.sources.map((source) => source.url).join(" | "),
      note: metricModel.note,
    };
  });
}
