"use client";

import { useState } from "react";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile, IssueMapModel } from "@/lib/issues/types";
import { PROVINCE_CODE, regionName, type RegionCode } from "@/lib/geo/regions";
import { isResourceMetric } from "@/lib/issues/model";
import { buildIssueComparison } from "@/lib/comparison";
import RegionComparison from "./RegionComparison";
import { SCHOOL_LEVEL_LABELS } from "@/lib/schoolVisuals";

const number = (n: number | null) => n === null ? "자료 없음" : n.toLocaleString("ko-KR");

export function IssueComparison({ bundle, data, model, region, compare, onCompare }: {
  bundle: DataBundle; data: EducationIssuesFile; model: IssueMapModel;
  region: RegionCode | null; compare: RegionCode | null; onCompare: (code: RegionCode | null) => void;
}) {
  if (!region) return <p className="text-xs text-ink-muted">시군을 선택하면 다른 지역과 나란히 비교할 수 있습니다.</p>;
  return <RegionComparison
    region={region} compare={compare} onCompare={onCompare}
    rows={compare ? buildIssueComparison(bundle, data, model, region, compare) : []}
    selectedId={model.metric}
    conditions={`교육문제=${model.issue.title}; 지표=${model.title}; 집계 학교급=${model.issue.id === "school-size" ? SCHOOL_LEVEL_LABELS[model.level ?? "elem"] : "지표별 정의 참조"}; 시군 전체 집계`}
  />;
}

export function IssueDetails({ bundle, data, model, region }: {
  bundle: DataBundle; data: EducationIssuesFile; model: IssueMapModel; region: RegionCode | null;
}) {
  const [allAssets, setAllAssets] = useState(false);
  if (isResourceMetric(model.metric)) {
    const rows = (data.resources ?? []).filter((resource) =>
      resource.issue === model.issue.id &&
      (resource.metric ?? (resource.issue === "care" ? "care-pilots" : model.metric)) === model.metric &&
      (!region || resource.regionCode === region));
    return <section aria-label="교육 자원 목록" className="space-y-2 rounded-xl bg-paper p-3">
      <h3 className="text-sm font-semibold">공식 명단에서 확인한 자원</h3>
      <p className="text-xs text-ink-muted">{model.note}</p>
      {!rows.length && <p className="text-sm">수록된 자원이 없습니다. 해당 지역에 자원이 전혀 없다는 뜻은 아닙니다.</p>}
      <ul className="max-h-72 space-y-2 overflow-y-auto">{rows.map((resource, index) => <li key={`${resource.issue}:${resource.metric}:${resource.regionCode}:${resource.name}:${index}`} className="rounded-lg border border-line bg-surface p-2 text-xs">
        <p className="font-semibold">{resource.name}</p>
        <p className="text-ink-muted">{resource.regionCode ? regionName(resource.regionCode) : "지역 미확인"}{resource.detail ? ` · ${resource.detail}` : ""}</p>
        {resource.address && <p>{resource.address}</p>}
        {resource.phone && <p>연락처 {resource.phone}</p>}
        {resource.capacity !== undefined && <p>정원 {resource.capacity ?? "자료 없음"}명 · 현원 {resource.enrolled ?? "자료 없음"}명</p>}
        {resource.referenceDate && <p className="text-ink-muted">기관 자료 기준 {resource.referenceDate}</p>}
      </li>)}</ul>
    </section>;
  }
  if (model.issue.id === "school-size") {
    const schools = model.schools.filter(s => !region || s.regionCode === region);
    const groups = [
      ["60명 이하", schools.filter(s => s.students !== null && s.students <= 60).length],
      ["61~999명", schools.filter(s => s.students !== null && s.students > 60 && s.students < 1000).length],
      ["1,000명 이상", schools.filter(s => s.students !== null && s.students >= 1000).length],
      ["자료 없음", schools.filter(s => s.students === null).length],
    ] as const;
    return <section aria-label="학교 규모 구간" className="space-y-2 rounded-xl bg-paper p-3">
      <h3 className="text-sm font-semibold">학교 규모별 분포 · 본교</h3>
      {groups.map(([label, count]) => <div key={label} className="flex justify-between text-sm"><span>{label}</span><strong>{count}개교</strong></div>)}
      <p className="text-xs text-ink-muted">학생 {schools.some(s => s.students === null) ? "자료 없음" : number(schools.reduce((n,s) => n + s.students!, 0))}명 · 규모 구간은 과밀·부실 판정이 아닙니다.</p>
    </section>;
  }
  if (model.issue.id === "closed-assets") {
    const rows = bundle.closedSchools.rows.filter(r => !region || r.regionCode === region);
    const unused = rows.filter(r => r.usage === "미활용");
    return <section aria-label="폐교재산 목록" className="space-y-3">
      <p className="text-sm font-semibold">수록 {rows.length}건 · 미활용 {unused.length}건 · {rows.length ? `${(unused.length / rows.length * 100).toFixed(1)}%` : "비율 해당 없음"}</p>
      <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" checked={allAssets} onChange={e => setAllAssets(e.target.checked)} />활용 중인 재산도 함께 보기</label>
      <p className="text-xs text-ink-muted">자료 기준 {bundle.closedSchools.referenceDate} · 게시 {bundle.closedSchools.publishedAt}. 주소만 제공하며 개별 위치는 지도에 표시하지 않습니다.</p>
      {(allAssets ? rows : unused).length === 0 && <p className="text-sm">해당 조건의 폐교재산이 없습니다.</p>}
      <ul className="space-y-2">{(allAssets ? rows : unused).map((row, index) => <li key={`${row.regionCode}-${row.name}-${index}`} className="rounded-lg border border-line p-3 text-xs leading-relaxed">
        <h4 className="text-sm font-semibold">{row.name} · {row.usage}</h4>
        <p>{row.address}</p><p>폐교 {row.year}년 · {regionName(row.regionCode as RegionCode)}</p>
        <p>건물 연면적 {number(row.buildingArea)}㎡ · 대지 {number(row.siteArea)}㎡</p>
      </li>)}</ul>
    </section>;
  }
  if (model.issue.id !== "special-education") return null;
  const trends = data.specialTrends?.filter(r => r.regionCode === (region ?? PROVINCE_CODE)).sort((a,b) => a.year - b.year);
  if (!trends?.length) return <p className="text-xs text-ink-muted">연도별 분리 자료가 없어 최신 현황만 표시합니다.</p>;
  return <section aria-label="특수교육 분리 추이" className="space-y-2">
    <h3 className="text-sm font-semibold">특수교육 학생·학급 수 변화</h3>
    <table className="w-full table-fixed text-xs"><thead><tr><th className="w-12 py-2">연도</th><th>일반학교<br />학생 / 학급</th><th>특수학교<br />학생 / 학급</th></tr></thead>
      <tbody>{trends.map(r => <tr key={r.year} className="border-t border-line text-center"><th className="py-2 font-normal">{r.year}</th><td>{number(r.regularStudents)}명 / {number(r.regularClasses)}</td><td>{number(r.specialStudents)}명 / {number(r.specialClasses)}</td></tr>)}</tbody>
    </table>
    <p className="text-xs text-ink-muted">각 연도 교육통계의 학교 모집단 기준. 학생 증가만으로 지원 부족이나 정책 효과를 판단하지 않습니다.</p>
  </section>;
}
