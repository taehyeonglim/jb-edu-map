import type { School } from "../schools/types";
import type { EducationIssuesFile, IssueResource } from "./types";
import { RESOURCE_METRIC_ISSUES } from "./model";
import { SCHOOL_SIZE_COLORS } from "../mapMetrics";

/** Pass the same main-school/level population used by the map. */
export function schoolSizeDistribution(schools: School[]) {
  return [
    { id: "small", label: "60명 이하", value: schools.filter(s => s.students !== null && s.students <= 60).length, color: `rgb(${SCHOOL_SIZE_COLORS[0].slice(0, 3).join(",")})` },
    { id: "medium", label: "61~999명", value: schools.filter(s => s.students !== null && s.students > 60 && s.students < 1000).length, color: `rgb(${SCHOOL_SIZE_COLORS[1].slice(0, 3).join(",")})` },
    { id: "large", label: "1,000명 이상", value: schools.filter(s => s.students !== null && s.students >= 1000).length, color: `rgb(${SCHOOL_SIZE_COLORS[2].slice(0, 3).join(",")})` },
    { id: "missing", label: "학생수 자료 없음", value: schools.filter(s => s.students === null).length, color: "rgb(96,116,134)" },
  ];
}

export function staffCoverage(schools: School[], data: EducationIssuesFile, role: "librarianTeachers" | "counselorTeachers") {
  const main = schools.filter(s => data.schools[s.id]?.isMain);
  const present = main.filter(s => (data.schools[s.id]?.[role] ?? 0) > 0).length;
  const missing = main.filter(s => data.schools[s.id]?.[role] == null).length;
  return { total: main.length, present, missing, absent: main.length - present - missing,
    share: main.length && !missing ? present / main.length * 100 : null };
}

export function issueResources(data: EducationIssuesFile, metric: string, region: string | null): IssueResource[] {
  const issue = RESOURCE_METRIC_ISSUES[metric];
  return (data.resources ?? []).filter(resource => resource.issue === issue &&
    (resource.metric ?? (resource.issue === "care" ? "care-pilots" : metric)) === metric &&
    (!region || resource.regionCode === region));
}

export function issueMetricUnit(metric: string): string {
  if (["student-change", "decline-small", "small-share", "unused-share"].includes(metric)) return "%";
  if (metric === "unused-count") return "건";
  if (metric === "special-classes") return "학급";
  if (metric === "special-students") return "명";
  if (metric === "career-regions" || metric === "designation") return "";
  if (RESOURCE_METRIC_ISSUES[metric] && metric !== "ai-focus-schools") return "곳";
  return "개교";
}
