import type { ComparisonRow } from "./comparison";
import { isRegionCode, regionName, type RegionCode } from "./geo/regions";
import type { School, SchoolsFile } from "./schools/types";
import type { SchoolFilters } from "./schools/filter";
import { SCHOOL_LEVEL_LABELS } from "./schoolVisuals";
import type { MapMetricSpec } from "./mapMetrics";
import { chartValueText } from "./schools/chart";

type CsvCell = string | number | null;

/** Numbers remain numeric (including negatives). Untrusted text cannot become a spreadsheet formula. */
export function toCsv(rows: CsvCell[][]): string {
  return (
    "\uFEFF" +
    rows
      .map((row) =>
        row
          .map((value) => {
            if (value === null) return "";
            if (typeof value === "number")
              return Number.isFinite(value) ? String(value) : "";
            const safe = /^[\s\uFEFF]*[=+@-]|^[\t\r\n]/u.test(value)
              ? `'${value}`
              : value;
            return `"${safe.replaceAll('"', '""')}"`;
          })
          .join(","),
      )
      .join("\r\n") +
    "\r\n"
  );
}

export function comparisonCsv(
  rows: ComparisonRow[],
  region: RegionCode,
  compare: RegionCode,
  conditions: string,
): string {
  return toCsv([
    [
      "지표코드",
      "분류",
      "지표",
      "단위",
      "기준지역코드",
      "기준지역",
      "기준값",
      "기준표시값",
      "기준자료상태",
      "비교지역코드",
      "비교지역",
      "비교값",
      "비교표시값",
      "비교자료상태",
      "차이(기준-비교)",
      "차이단위",
      "차이표시값",
      "기준일·확인일",
      "출처",
      "출처URL",
      "적용조건",
      "해석안내",
    ],
    ...rows.map((row) => [
      row.id,
      row.group,
      row.label,
      row.unit,
      region,
      regionName(region),
      row.values[0],
      row.texts[0],
      row.values[0] === null ? row.texts[0] : "값 있음",
      compare,
      regionName(compare),
      row.values[1],
      row.texts[1],
      row.values[1] === null ? row.texts[1] : "값 있음",
      row.difference,
      row.differenceUnit,
      row.differenceText,
      row.referenceDate,
      row.source,
      row.sourceUrl,
      conditions,
      row.note,
    ]),
  ]);
}

export function schoolCsv(
  schools: School[],
  file: SchoolsFile,
  filters: SchoolFilters,
  context: string,
  metric?: Pick<MapMetricSpec, "kind" | "title" | "unit" | "date" | "value">,
): string {
  const conditions = `${context}; 검색어=${filters.name}; 학교급=${filters.level}; 시군=${filters.regionCode ?? "전체"}`;
  return toCsv([
    [
      "학교코드",
      "KEDI코드",
      "학교명",
      "시군코드",
      "시군",
      "학교급",
      "분교",
      "학생수(명)",
      "학급수(개)",
      "교원수(명)",
      "학급당학생수(명)",
      "자료상태",
      "위도",
      "경도",
      "위치상태",
      "통계기준일",
      "통계출처",
      "통계출처URL",
      "위치기준일·확인일",
      "위치출처",
      "위치출처URL",
      "선택지표",
      "선택지표값",
      "선택지표단위",
      "선택지표표시값",
      "선택지표기준일",
      "적용조건",
    ],
    ...schools.map((school) => {
      const missing = [
        ["학생수", school.students],
        ["학급수", school.classes],
        ["교원수", school.teachers],
        ["학급당학생수", school.studentsPerClass],
      ]
        .filter(([, value]) => value === null)
        .map(([label]) => label);
      const selectedValue =
        metric && metric.kind !== "region" ? metric.value(school) : null;
      return [
        school.id,
        school.kediCode ?? "",
        school.name,
        school.regionCode,
        isRegionCode(school.regionCode)
          ? regionName(school.regionCode)
          : school.regionCode,
        SCHOOL_LEVEL_LABELS[school.level],
        school.branch ? "분교" : "본교",
        school.students,
        school.classes,
        school.teachers,
        school.studentsPerClass,
        missing.length ? `${missing.join("·")} 자료 없음` : "값 있음",
        school.lat,
        school.lng,
        school.lat === null || school.lng === null ? "위치 없음" : "위치 있음",
        file.referenceDate.stats,
        file.source.stats.name,
        file.source.stats.url,
        school.locationSource?.verifiedAt ?? file.referenceDate.location,
        school.locationSource
          ? "학교 공식 위치 안내"
          : file.source.location.name,
        school.locationSource?.url ?? file.source.location.url,
        metric?.title ?? "",
        selectedValue,
        metric?.unit ?? "",
        metric?.kind === "region"
          ? "시군 집계 지표"
          : metric
            ? chartValueText(selectedValue, metric.unit)
            : "",
        metric?.date ?? "",
        conditions,
      ];
    }),
  ]);
}

export function downloadCsv(filename: string, content: string): void {
  const url = URL.createObjectURL(
    new Blob([content], { type: "text/csv;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
