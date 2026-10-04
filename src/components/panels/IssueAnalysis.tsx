"use client";

import { useState } from "react";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile, IssueMapModel, IssueResource } from "@/lib/issues/types";
import { PROVINCE_CODE, REGION_CODES, regionName, type RegionCode } from "@/lib/geo/regions";
import { ACTIVE_PROFILE } from "@/lib/profiles";
import { issueValue, RESOURCE_METRIC_ISSUES } from "@/lib/issues/model";
import { issueResources, schoolSizeDistribution, staffCoverage } from "@/lib/issues/analysis";
import { SCHOOL_LEVEL_COLORS, SCHOOL_LEVEL_LABELS, SCHOOL_LEVEL_ORDER } from "@/lib/schoolVisuals";
import { THEME } from "@/lib/theme";
import { changeYearRange } from "@/lib/stats";
import { BarChart, CompositionChart } from "@/components/ui/AnalysisCharts";
import TimeSeriesChart from "@/components/ui/TimeSeriesChart";

interface Props {
  bundle: DataBundle;
  data: EducationIssuesFile;
  model: IssueMapModel;
  region: RegionCode | null;
  compare: RegionCode | null;
  onMetric: (metric: string) => void;
}
const scopeName = (region: RegionCode | null) => region ? regionName(region) : `${ACTIVE_PROFILE.province.shortName} 전체`;
const numericValue = (value: ReturnType<typeof issueValue>) => typeof value === "number" ? value : null;
const number = (value: number) => value.toLocaleString("ko-KR");
const button = "min-h-11 rounded border border-line px-3 py-2 text-xs aria-pressed:border-accent aria-pressed:bg-accent-soft";

function CareCapacityAnalysis({ resources }: { resources: IssueResource[] }) {
  const [selected, setSelected] = useState(0);
  const resource = resources[selected] ?? resources[0];
  if (!resource) return null;
  return <section aria-label="기관별 돌봄 정원과 현원" className="space-y-3">
    <label className="block text-xs font-semibold">정원·현원 비교 기관
      <select className="mt-2 min-h-11 w-full rounded border border-line bg-surface px-2 text-sm" value={resources.indexOf(resource)} onChange={event => setSelected(Number(event.target.value))}>
        {resources.map((row, index) => <option key={`${row.regionCode}:${row.name}:${index}`} value={index}>{row.regionCode ? `${regionName(row.regionCode)} · ` : ""}{row.name}</option>)}
      </select>
    </label>
    <BarChart title={resource.name} unit="명" rows={[
      { id: "capacity", label: "정원", value: resource.capacity ?? null, color: THEME.accent },
      { id: "enrolled", label: "현원", value: resource.enrolled ?? null, color: THEME.warningText },
    ]} note={`기관 자료 기준 ${resource.referenceDate ?? "자료 없음"} · 실시간 이용 가능 자리가 아닙니다.`} />
  </section>;
}

function SpecialEducationAnalysis({ data, model, region, compare, onMetric }: Props) {
  const [view, setView] = useState<"types" | "regions">("types");
  const classes = model.metric === "special-classes";
  const scope = region ?? PROVINCE_CODE;
  const rows = (code: string, special: boolean) => (data.specialTrends ?? []).filter(row => row.regionCode === code).map(row => ({
    year: row.year,
    value: classes ? (special ? row.specialClasses : row.regularClasses) : (special ? row.specialStudents : row.regularStudents),
  }));
  const compareRegions = view === "regions" && !!region && !!compare;
  return <section aria-label="특수교육 핵심 비교" className="space-y-3">
    <div role="group" aria-label="특수교육 추이 단위" className="flex flex-wrap gap-2">
      <button type="button" className={button} aria-pressed={!classes} onClick={() => onMetric("special-students")}>학생수 추이</button>
      <button type="button" className={button} aria-pressed={classes} onClick={() => onMetric("special-classes")}>학급수 추이</button>
    </div>
    {region && compare && <div role="group" aria-label="특수교육 추이 비교 방식" className="flex flex-wrap gap-2">
      <button type="button" className={button} aria-pressed={!compareRegions} onClick={() => setView("types")}>학교 유형 비교</button>
      <button type="button" className={button} aria-pressed={compareRegions} onClick={() => setView("regions")}>두 지역 비교</button>
    </div>}
    <TimeSeriesChart key={`${scope}:${compareRegions}:${classes}`}
      place={`${scopeName(region)} 일반학교`} label={classes ? "특수학급 수" : "특수학급 학생수"}
      unit={classes ? "학급" : "명"} format={number} data={rows(scope, false)}
      comparison={{ place: compareRegions ? `${scopeName(compare)} 일반학교` : `${scopeName(region)} 특수학교`, data: rows(compareRegions ? compare! : scope, !compareRegions) }} />
    <p className="text-xs leading-relaxed text-ink-muted">{compareRegions ? "일반학교 특수학급만 두 지역의 같은 척도로 비교합니다." : "일반학교 특수학급과 특수학교를 같은 척도로 구분합니다."} 학생수와 학급수는 따로 표시합니다.</p>
  </section>;
}

/** A question-specific answer before guides, long lists and source details. */
export default function IssueAnalysis(props: Props) {
  const { bundle, data, model, region, compare } = props;
  const name = scopeName(region);
  const scope = region ?? PROVINCE_CODE;
  const schools = bundle.schools.schools.filter(school => !region || school.regionCode === region);
  const scopes = [region, ...(region && compare ? [compare] : [])];

  if (model.issue.id === "school-size") return <section aria-label="학교 규모 핵심 비교" className="space-y-3">
    {scopes.map(code => {
      const rows = model.schools.filter(school => !code || school.regionCode === code);
      return <CompositionChart key={code ?? "province"} title={`${scopeName(code)} 학교 규모별 분포`}
        segments={schoolSizeDistribution(rows)}
        note={`${SCHOOL_LEVEL_LABELS[model.level ?? "elem"]} 본교 ${rows.length}개교 · ${data.statsReferenceDate} · 휴교 포함, 분교 제외. 학생수 자료 없음도 전체 분모에 포함합니다.`} />;
    })}
  </section>;

  if (model.issue.id === "regional-sustainability") return <section aria-label="학생 변화와 작은학교 핵심 비교" className="space-y-3">
    <BarChart title="학생수 증감률" unit="%" rows={scopes.map(code => {
      const value = numericValue(issueValue(bundle, data, "student-change", code ?? PROVINCE_CODE));
      return { id: code ?? PROVINCE_CODE, label: scopeName(code), value, text: value === null ? "계산 불가" : `${value > 0 ? "+" : ""}${value.toFixed(1)}%`, color: value !== null && value < 0 ? THEME.warning : THEME.positive };
    })} note={`${changeYearRange(bundle.series.students_total)?.join("→") ?? "기간 자료 없음"} 학생수 변화 · 작은학교 비율과 다른 척도입니다.`} />
    <BarChart title="소규모학교 비율" unit="%" domain={[0, 100]} rows={scopes.map(code => {
      const value = numericValue(issueValue(bundle, data, "small-share", code ?? PROVINCE_CODE));
      return { id: code ?? PROVINCE_CODE, label: scopeName(code), value, text: value === null ? "자료 없음" : `${value.toFixed(1)}%` };
    })} note={`학생 60명 이하 본교 ÷ 전체 본교 · ${data.statsReferenceDate}`} />
  </section>;

  if (model.issue.id === "special-education") return <SpecialEducationAnalysis {...props} />;

  if (model.issue.id === "closed-assets") return <section aria-label="폐교 활용 핵심 비교" className="space-y-3">
    {scopes.map(code => {
      const assets = bundle.closedSchools.rows.filter(row => !code || row.regionCode === code);
      const unused = assets.filter(row => row.usage === "미활용").length;
      return <CompositionChart key={code ?? "province"} title={`${scopeName(code)} 수록 폐교재산 활용 구성`}
        segments={[{ id: "unused", label: "미활용", value: unused, color: THEME.warning }, { id: "used", label: "활용 중", value: assets.length - unused, color: THEME.accent }]}
        note={`수록 ${assets.length}건을 분모로 계산 · 기준 ${bundle.closedSchools.referenceDate} · 전체 폐교 이력이 아닙니다.`} />;
    })}
  </section>;

  if (["basic-learning", "career"].includes(model.issue.id)) {
    const available = model.regions.filter(row => typeof row.value === "number" && row.value > 0).length;
    const missing = model.regions.filter(row => row.value === null).length;
    const source = data.resourceSources?.[model.metric] ?? data.resourceSources?.[RESOURCE_METRIC_ISSUES[model.metric]];
    const uniform = !missing && model.regions.every(row => row.value === model.regions[0]?.value);
    return <section aria-label="지역별 제공 현황" className="space-y-3 rounded-xl border border-line bg-paper p-3">
      <h3 className="text-sm font-semibold">{model.issue.id === "career" ? "지역별 상담 신청 안내" : "지역별 기초학력지원센터"}</h3>
      <p className="text-2xl font-semibold tabular-nums">{available} / {REGION_CODES.length}<span className="ml-2 text-sm font-normal">개 시군 수록</span></p>
      <div className="grid grid-cols-7 gap-1" role="img" aria-label={`${REGION_CODES.length}개 시군 중 ${available}개 수록, ${missing}개 자료 없음`}>
        {model.regions.map(row => <span key={row.code} className="h-3 rounded-sm border border-line" style={{ backgroundColor: row.value === null ? THEME.inkMuted : typeof row.value === "number" && row.value > 0 ? THEME.accent : THEME.surface }} />)}
      </div>
      <p className="text-xs leading-relaxed text-ink-muted">{uniform ? "모든 시군이 같은 제공 현황입니다. " : "지역별 수록 여부를 확인하세요. "}{model.issue.id === "career" ? "실제 일정·장소와 신청 가능 여부는 공식 예약 화면에서 확인하세요." : "센터 수는 지원 인력이나 학생 접근성을 뜻하지 않습니다."}</p>
      {source && <a href={source.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center text-sm font-semibold text-accent-text underline">{model.issue.id === "career" ? "공식 상담 신청 안내 열기" : "공식 센터 안내 열기"} →</a>}
    </section>;
  }

  if (["reading", "wellbeing"].includes(model.issue.id)) {
    const reading = model.issue.id === "reading";
    const staff = staffCoverage(schools, data, reading ? "librarianTeachers" : "counselorTeachers");
    const resourceMetric = reading ? "libraries" : "wee-centers";
    const resourceValue = numericValue(issueValue(bundle, data, resourceMetric, scope));
    const source = data.resourceSources?.[resourceMetric] ?? data.resourceSources?.[model.issue.id];
    return <section aria-label="기관과 교사 배치 핵심 비교" className="space-y-3">
      <BarChart title={`${reading ? "교육청 도서관" : "지역 Wee센터"} 수`} unit="곳" rows={scopes.map(code => ({
        id: code ?? PROVINCE_CODE, label: scopeName(code), value: code === region ? resourceValue : numericValue(issueValue(bundle, data, resourceMetric, code ?? PROVINCE_CODE)),
      }))} note={`공식 명단 기관 수 · ${source?.referenceDate ? `기준 ${source.referenceDate}` : `공식 자료 확인 ${source?.checkedAt ?? "자료 없음"}`} · 학교의 교사 배치와 별도로 집계합니다.`} />
      {scopes.map(code => {
        const coverage = code === region ? staff : staffCoverage(bundle.schools.schools.filter(school => school.regionCode === code), data, reading ? "librarianTeachers" : "counselorTeachers");
        return <CompositionChart key={code ?? "province"} title={`${scopeName(code)} ${reading ? "사서교사" : "전문상담교사"} 배치학교`}
          segments={[{ id: "present", label: "1명 이상 배치", value: coverage.present, color: THEME.accent }, { id: "absent", label: "정규교사 0명", value: coverage.absent, color: THEME.line }, { id: "missing", label: "자료 없음", value: coverage.missing, color: THEME.inkMuted }]}
          note={`배치 ${coverage.present} / 전체 ${coverage.total}개 본교 · 배치율 ${coverage.share === null ? "자료 없음" : `${coverage.share.toFixed(1)}%`} · 기준 ${data.statsReferenceDate}. 정규교사만 포함합니다.`} />;
      })}
    </section>;
  }

  if (model.issue.id === "care") {
    const resources = issueResources(data, model.metric, region);
    const source = data.resourceSources?.[model.metric] ?? data.resourceSources?.care;
    const covered = source?.coveredRegions;
    const unknownRegion = issueResources(data, model.metric, null).filter(row => !row.regionCode).length;
    return <section aria-label="돌봄 자료 수록 범위" className="space-y-3 rounded-xl border border-line bg-paper p-3">
      <h3 className="text-sm font-semibold">{model.metric === "care-centers" ? `지역아동센터 자료 ${covered?.length ?? REGION_CODES.length}/${REGION_CODES.length}개 시군 수록` : "거점형 유아 돌봄 시범기관"}</h3>
      {covered && <p className="text-xs leading-relaxed text-ink-muted">미등록 지역은 0곳이 아닌 자료 없음입니다.{region && !covered.includes(region) ? ` ${name} · 원자료 미등록 지역입니다.` : ""}</p>}
      {unknownRegion > 0 && <p className="text-xs text-ink-muted">지역 미확인 {unknownRegion}곳은 도 전체 수에만 포함됩니다.</p>}
      <BarChart title={`${name} 수록 기관`} unit="곳" rows={[{ id: scope, label: model.title, value: numericValue(issueValue(bundle, data, model.metric, scope)) }]} />
      {model.metric === "care-centers" && <CareCapacityAnalysis key={region ?? "province"} resources={resources} />}
    </section>;
  }

  if (model.issue.id === "ai-education") {
    const resources = issueResources(data, model.metric, region);
    const byId = new Map(bundle.schools.schools.map(school => [school.id, school]));
    const linked = resources.flatMap(resource => resource.schoolId && byId.has(resource.schoolId) ? [byId.get(resource.schoolId)!] : []);
    return <section aria-label="AI 중점학교 핵심 비교" className="space-y-3">
      <CompositionChart title={`${name} AI 중점학교의 학교급 구성`} segments={[
        ...SCHOOL_LEVEL_ORDER.map(level => ({ id: level, label: SCHOOL_LEVEL_LABELS[level], value: linked.filter(school => school.level === level).length, color: `rgb(${SCHOOL_LEVEL_COLORS[level].slice(0, 3).join(",")})` })),
        { id: "unmatched", label: "학교급 미확인", value: resources.length - linked.length, color: THEME.inkMuted },
      ]} note={`공식 지정명단 ${resources.length}개교 · ${model.date} · 지정 학교 수이며 참여 학생수나 교육 성과가 아닙니다.`} />
    </section>;
  }
  return null;
}
