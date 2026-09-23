import type { DataBundle } from "../data/types";
import { PROVINCE_CODE, REGION_CODES, regionName, type RegionCode } from "../geo/regions";
import { ACTIVE_PROFILE } from "../profiles";
import type { School } from "../schools/types";
import { changeYearRange } from "../stats";
import { METRIC_LABELS, resolveIssueMetric } from "./registry";
import type {
  Designation,
  EducationIssue,
  EducationIssuesFile,
  IssueColor,
  IssueMapModel,
  IssueLevel,
} from "./types";

export const DESIGNATION_LABELS: Record<Designation, string> = {
  decline: "인구감소지역",
  attention: "관심지역",
  none: "해당 지정 없음",
};
const MISSING: IssueColor = [96, 116, 134, 110];
const CATEGORY: Record<Designation, IssueColor> = {
  decline: [131, 152, 230, 115],
  attention: [242, 140, 98, 115],
  none: [57, 79, 98, 70],
};
const PURPLE = [
  [48, 58, 108],
  [70, 87, 154],
  [95, 116, 196],
  [131, 152, 230],
  [176, 185, 255],
];
const count = (v: number) => v.toLocaleString("ko-KR");
const strictSum = (values: (number | null)[]) =>
  values.some((v) => v === null)
    ? null
    : values.reduce<number>((sum, v) => sum + v!, 0);

export const RESOURCE_METRIC_ISSUES: Readonly<Record<string, string>> = {
  "basic-centers": "basic-learning",
  libraries: "reading",
  "care-pilots": "care",
  "care-centers": "care",
  "wee-centers": "wellbeing",
  "career-regions": "career",
  "ai-focus-schools": "ai-education",
};
export const isResourceMetric = (metric: string) => metric in RESOURCE_METRIC_ISSUES;

export function studentChange(bundle: DataBundle, code: string): number | null {
  const series = bundle.series.students_total;
  const range = changeYearRange(series);
  if (!range || range[0] === range[1]) return null;
  const start = series.rows.find(
    (r) => r.regionCode === code && r.year === range[0],
  )?.value;
  const end = series.rows.find(
    (r) => r.regionCode === code && r.year === range[1],
  )?.value;
  return start == null || end == null || start === 0
    ? null
    : ((end - start) / start) * 100;
}

export function issueValue(
  bundle: DataBundle,
  data: EducationIssuesFile,
  metric: string,
  code: string,
  level: IssueLevel = "elem",
): number | Designation | null {
  const resourceIssue = RESOURCE_METRIC_ISSUES[metric];
  if (resourceIssue) {
    const source = data.resourceSources?.[metric] ?? data.resourceSources?.[resourceIssue];
    if (!data.resources || !source) return null;
    if (code !== PROVINCE_CODE && source.coveredRegions && !source.coveredRegions.includes(code)) return null;
    return data.resources.filter((resource) => resource.issue === resourceIssue &&
      (resource.metric ?? (resource.issue === "care" ? "care-pilots" : metric)) === metric &&
      (code === PROVINCE_CODE || resource.regionCode === code)).length;
  }
  if (metric === "designation")
    return data.designations[code as RegionCode] ?? null;
  if (metric === "student-change" || metric === "decline-small") return studentChange(bundle, code);
  if (metric === "unused-count" || metric === "unused-share") {
    const assets = bundle.closedSchools.rows.filter(r => code === PROVINCE_CODE || r.regionCode === code);
    const unused = assets.filter(r => r.usage === "미활용").length;
    return metric === "unused-count" ? unused : assets.length ? unused / assets.length * 100 : null;
  }
  const rows = bundle.schools.schools.filter(
    (s) => code === PROVINCE_CODE || s.regionCode === code,
  );
  const main = rows.filter((s) => data.schools[s.id].isMain);
  const regular = rows.filter((s) => s.level !== "special");
  switch (metric) {
    case "school-size": return main.filter(s => s.level === level).length;
    case "small-share":
      return !main.length || main.some((s) => s.students === null)
        ? null
        : (main.filter((s) => s.students! <= 60).length / main.length) * 100;
    case "zero-entrants":
      return main.some((s) => data.schools[s.id].entrants === null)
        ? null
        : main.filter((s) => data.schools[s.id].entrants === 0).length;
    case "special-classes":
      return strictSum(regular.map((s) => data.schools[s.id].specialClasses));
    case "special-students":
      return strictSum(regular.map((s) => data.schools[s.id].specialStudents));
    case "special-schools":
      return main.filter((s) => s.level === "special").length;
    case "librarian-schools":
      return main.some((s) => data.schools[s.id].librarianTeachers == null) ? null :
        main.filter((s) => (data.schools[s.id].librarianTeachers ?? 0) > 0).length;
    case "counselor-schools":
      return main.some((s) => data.schools[s.id].counselorTeachers == null) ? null :
        main.filter((s) => (data.schools[s.id].counselorTeachers ?? 0) > 0).length;
    default:
      return null;
  }
}

export function formatIssueValue(
  metric: string,
  value: number | Designation | null,
): string {
  if (value === null)
    return metric === "unused-share" ? "해당 없음" : ["student-change", "decline-small"].includes(metric) ? "계산 불가" : "자료 없음";
  if (typeof value === "string") return DESIGNATION_LABELS[value];
  if (metric === "student-change" || metric === "decline-small")
    return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
  if (metric === "small-share" || metric === "unused-share") return `${value.toFixed(1)}%`;
  if (metric === "unused-count") return `${count(value)}건`;
  if (["librarian-schools", "counselor-schools"].includes(metric)) return `${count(value)}개교`;
  if (isResourceMetric(metric))
    return metric === "career-regions" ? (value > 0 ? "상담 신청 지역" : "신청 지역 목록에 없음")
      : `${count(value)}${metric === "ai-focus-schools" ? "개교" : "곳"}`;
  return `${count(value)}${metric === "special-classes" ? "학급" : metric === "special-students" ? "명" : "개교"}`;
}

function relatedSchool(
  school: School,
  data: EducationIssuesFile,
  metric: string,
): boolean {
  const facts = data.schools[school.id];
  if (metric === "small-share")
    return facts.isMain && school.students !== null && school.students <= 60;
  if (metric === "zero-entrants") return facts.isMain && facts.entrants === 0;
  if (metric === "special-schools")
    return facts.isMain && school.level === "special";
  if (metric === "special-classes" || metric === "special-students")
    return school.level !== "special" && (facts.specialClasses ?? 0) > 0;
  if (metric === "librarian-schools") return facts.isMain && (facts.librarianTeachers ?? 0) > 0;
  if (metric === "counselor-schools") return facts.isMain && (facts.counselorTeachers ?? 0) > 0;
  return true;
}

export function buildIssueModel(
  bundle: DataBundle,
  data: EducationIssuesFile,
  issue: EducationIssue,
  requestedMetric: string | null,
  level: IssueLevel = "elem",
): IssueMapModel {
  const metric = resolveIssueMetric(issue, requestedMetric);
  const raw = REGION_CODES.map((code) => ({
    code,
    value: issueValue(bundle, data, metric, code, level),
  }));
  const numbers = raw.flatMap((r) =>
    typeof r.value === "number" ? [r.value] : [],
  );
  const max =
    ["small-share", "unused-share"].includes(metric) ? 100 : Math.max(1, ...numbers.map(Math.abs));
  const colorOf = (value: number | Designation | null): IssueColor => {
    if (value === null) return MISSING;
    if (typeof value === "string") return CATEGORY[value];
    if (metric === "student-change" || metric === "decline-small") {
      const strength = Math.min(1, Math.abs(value) / max);
      const end = value < 0 ? [242, 140, 98] : [114, 229, 189];
      return [
        ...end.map((v, i) => Math.round([48, 58, 82][i] + (v - [48, 58, 82][i]) * strength)),
        130,
      ] as IssueColor;
    }
    return [
      ...PURPLE[Math.min(4, Math.floor((value / max) * 5))],
      130,
    ] as IssueColor;
  };
  const regions = raw.map((r) => ({
    ...r,
    text: formatIssueValue(metric, r.value),
    color: colorOf(r.value),
  }));
  regions.sort((a, b) => {
    if (a.value === null)
      return b.value === null
        ? regionName(a.code).localeCompare(regionName(b.code), "ko")
        : 1;
    if (b.value === null) return -1;
    if (typeof a.value === "string" && typeof b.value === "string") {
      const order = { decline: 0, attention: 1, none: 2 };
      return (
        order[a.value] - order[b.value] ||
        regionName(a.code).localeCompare(regionName(b.code), "ko")
      );
    }
    return (
      (["student-change", "decline-small"].includes(metric)
        ? Number(a.value) - Number(b.value)
        : Number(b.value) - Number(a.value)) ||
      regionName(a.code).localeCompare(regionName(b.code), "ko")
    );
  });
  const range = changeYearRange(bundle.series.students_total);
  const title =
    ["student-change", "decline-small"].includes(metric) && range
      ? `학생수 ${range[0]}→${range[1]} 증감률`
      : METRIC_LABELS[metric];
  let legend: IssueMapModel["legend"];
  if (metric === "designation") {
    legend = (["decline", "attention", "none"] as const).map((value) => ({
      label: DESIGNATION_LABELS[value],
      color: colorOf(value),
    }));
  } else if (metric === "student-change" || metric === "decline-small") {
    legend = [-max, 0, max].map((value) => ({
      label: formatIssueValue(metric, value),
      color: colorOf(value),
    }));
  } else if (isResourceMetric(metric)) {
    const ticks = max <= 5
      ? Array.from({ length: max + 1 }, (_, i) => i)
      : [0, ...Array.from({ length: 5 }, (_, i) => Math.ceil(((i + 1) * max) / 5))];
    legend = [...new Set(ticks)].map((value) => ({
      label: formatIssueValue(metric, value),
      color: colorOf(value),
    }));
  } else {
    legend = Array.from({ length: 5 }, (_, i) => ({
      label: `${((max * i) / 5).toFixed(1)}–${((max * (i + 1)) / 5).toFixed(1)}`,
      color: [...PURPLE[i], 100] as IssueColor,
    }));
  }
  if (raw.some((r) => r.value === null))
    legend.push({ label: "자료 없음", color: MISSING });
  const note =
    isResourceMetric(metric) ? (data.resourceSources?.[metric] ?? data.resourceSources?.[RESOURCE_METRIC_ISSUES[metric]])?.scope ?? "공개 자료의 수록 범위만 표시합니다."
    : metric === "librarian-schools" ? "KESS 2026 학교별 정규 사서교사가 1명 이상인 본교 수입니다. 도서관의 장서·개방시간·사서직원 수를 뜻하지 않습니다."
    : metric === "counselor-schools" ? "KESS 2026 학교별 정규 전문상담교사가 1명 이상인 본교 수입니다. 상담 이용 가능 시간이나 기간제·외부 상담인력을 뜻하지 않습니다."
    : metric === "school-size" ? "본교 기준 · 60명 이하 / 61~999명 / 1,000명 이상은 앱의 탐색 구간이며 과밀·부실 판정이 아닙니다. 휴교 포함, 분교 제외."
    : metric.startsWith("unused-") ? "자료에 수록된 폐교재산 기준입니다. 전체 폐교 이력이 아니며, 비율은 해당 지역 수록 재산을 분모로 합니다. 주소만 제공되므로 개별 위치는 표시하지 않습니다."
    : metric === "decline-small" ? "면 색은 시군 학생수 증감률, 점은 학생 60명 이하 본교입니다. 서로 다른 집계 단위이며 통폐합 예정이나 정책 효과를 뜻하지 않습니다."
    : metric === "designation"
      ? "공식 지정 현황입니다. 지정 없음은 안전을 뜻하지 않으며, 지역 소멸을 예측하는 지수가 아닙니다."
      : metric === "student-change"
        ? "같은 기간의 재학생 수 변화입니다. 미래 인구 예측이나 정책 효과를 뜻하지 않습니다."
        : metric === "small-share"
          ? "학생수 60명 이하 본교 ÷ 전체 본교. 앱 자체 기준이며 분교장은 제외합니다. 휴교는 교육통계 기준에 따라 포함합니다."
          : metric === "zero-entrants"
            ? "해당 연도 신입생 0명인 본교 수입니다. 분교장은 제외하고 휴교는 포함합니다. 통폐합 예정 여부를 뜻하지 않습니다."
            : metric === "special-schools"
              ? "특수학교 본교 수입니다. 현재 위치 자료가 없는 학교도 지역 집계와 목록에 포함합니다."
              : "일반학교(초·중·고, 분교 포함)의 특수학급만 집계하며 특수학교는 제외합니다. 수치만으로 지원의 충분·부족을 판단할 수 없습니다.";
  const source = isResourceMetric(metric)
    ? data.resourceSources?.[metric] ?? data.resourceSources?.[RESOURCE_METRIC_ISSUES[metric]]
    : metric.startsWith("unused-")
    ? { ...bundle.closedSchools.source, referenceDate: bundle.closedSchools.referenceDate }
    : data.sources[metric === "designation" ? 0 : 1];
  return {
    issue,
    level,
    regionOverlay: metric === "decline-small",
    readingGuide: isResourceMetric(metric) ? (metric === "ai-focus-schools"
      ? "시군의 색은 공식 명단의 AI 중점학교 수입니다. 학교 점을 누르면 해당 학교 정보를 볼 수 있습니다."
      : "시군의 색은 공식 명단에서 확인한 기관·신청 지역 수입니다. 지역을 누르면 이름과 주소·연락처를 볼 수 있습니다. 주소만 있는 기관은 점 위치를 표시하지 않습니다.")
      : ["librarian-schools", "counselor-schools"].includes(metric) ? "시군의 색은 해당 정규교사가 배치된 본교 수입니다. 학교 점을 누르면 해당 학교를 확인할 수 있습니다."
      : metric === "school-size" ? "원의 크기는 학생 수, 색은 규모 구간입니다. 원을 누르면 학교별 수치를 볼 수 있습니다."
      : metric === "decline-small" ? "시군의 학생 증감률 위에 작은학교를 표시합니다. 주황 테두리는 신입생 0명 학교입니다."
      : metric.startsWith("unused-") ? "시군의 색이 진할수록 미활용 건수 또는 비율이 큽니다. 지역을 누르면 주소 목록을 확인할 수 있습니다."
      : issue.id === "special-education" ? "보라색 원은 일반학교 특수학급, ◆는 특수학교입니다. 원 크기는 선택한 학생·학급 수입니다."
      : "시군을 선택해 지역 현황과 관련 학교를 함께 확인하세요.",
    metric,
    title,
    note,
    regions,
    legend,
    date: source?.referenceDate
      ? `기준 ${source.referenceDate}`
      : `공식 자료 확인 ${source?.checkedAt ?? "자료 없음"}`,
    provinceText:
      metric === "designation"
        ? `인구감소지역 ${raw.filter((r) => r.value === "decline").length}곳 · 관심지역 ${raw.filter((r) => r.value === "attention").length}곳`
        : metric === "care-pilots" ? `${ACTIVE_PROFILE.province.shortName} 수록 ${formatIssueValue(metric, issueValue(bundle, data, metric, PROVINCE_CODE, level))} · 지역 확인 ${raw.reduce((sum, row) => sum + (typeof row.value === "number" ? row.value : 0), 0)}곳`
        : metric === "care-centers" ? `${ACTIVE_PROFILE.province.shortName} 수록 ${formatIssueValue(metric, issueValue(bundle, data, metric, PROVINCE_CODE, level))} · ${raw.filter((row) => row.value !== null).length}개 시군 자료`
        : metric === "career-regions" ? `${ACTIVE_PROFILE.province.shortName} ${issueValue(bundle, data, metric, PROVINCE_CODE, level)}개 지역 상담 신청 안내`
        : `${ACTIVE_PROFILE.province.shortName} 전체 ${formatIssueValue(metric, issueValue(bundle, data, metric, PROVINCE_CODE, level))}`,
    schools: bundle.schools.schools
      .filter((s) => isResourceMetric(metric) ? metric === "ai-focus-schools" && !!data.resources?.some((resource) => resource.issue === "ai-education" && resource.schoolId === s.id)
        : metric.startsWith("unused-") ? false
        : metric === "school-size" ? data.schools[s.id].isMain && s.level === level
        : metric === "decline-small" ? relatedSchool(s, data, "small-share")
        : relatedSchool(s, data, metric))
      .sort((a, b) => a.name.localeCompare(b.name, "ko")),
    sources: metric === "designation" ? data.sources : source ? [source] : [],
  };
}
