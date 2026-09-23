import { ACTIVE_PROFILE } from "../profiles";
import type { EducationIssue } from "./types";

/** Policy questions belong to the selected regional profile. */
export const POLICY_SOURCE = ACTIVE_PROFILE.policy.source;
export const EDUCATION_ISSUES = ACTIVE_PROFILE.policy.issues;
export const PUBLISHED_ISSUES = EDUCATION_ISSUES.filter((issue) => issue.status === "published");
export const ISSUE_IDS = PUBLISHED_ISSUES.map((issue) => issue.id);
export const ISSUE_METRICS = PUBLISHED_ISSUES.flatMap((issue) => issue.metrics);
export function issueById(id: string | null) {
  return PUBLISHED_ISSUES.find((issue) => issue.id === id) ?? null;
}
export function resolveIssueMetric(issue: EducationIssue, metric: string | null) {
  return metric && issue.metrics.includes(metric) ? metric : issue.metrics[0];
}
export const METRIC_LABELS: Record<string, string> = {
  "decline-small": "학생수 변화와 작은학교",
  "school-size": "학교 규모 구간",
  designation: "인구감소지역 지정",
  "student-change": "학생수 증감률",
  "small-share": "소규모학교 비율",
  "zero-entrants": "신입생 0명 학교 수",
  "special-classes": "일반학교 특수학급 수",
  "special-students": "일반학교 특수학급 학생수",
  "special-schools": "특수학교 수",
  "unused-count": "미활용 폐교 수",
  "unused-share": "미활용 폐교 비율",
  "basic-centers": "기초학력지원센터 수",
  libraries: "교육청 도서관 수",
  "care-pilots": "거점형 돌봄 시범기관 수",
  "care-centers": "지역아동센터 수",
  "librarian-schools": "사서교사 배치 학교 수",
  "counselor-schools": "전문상담교사 배치 학교 수",
  "wee-centers": "지역 Wee센터 수",
  "career-regions": "지역별 진로진학 상담 제공",
  "ai-focus-schools": "AI 중점학교 수",
};
