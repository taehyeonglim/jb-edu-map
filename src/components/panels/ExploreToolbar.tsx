"use client";

import { createSerializer } from "nuqs";
import { useState } from "react";
import { regionName } from "@/lib/geo/regions";
import { DEFAULT_INDICATOR_ID } from "@/lib/indicators/registry";
import { SCHOOL_LEVEL_LABELS } from "@/lib/schoolVisuals";
import { mapQueryParsers, useMapQuery } from "@/lib/state/urlState";

const serialize = createSerializer(mapQueryParsers);
const chip =
  "min-h-11 rounded border border-line px-2 text-left text-xs break-words hover:bg-paper";

export default function ExploreToolbar({ title, compact = false }: { title: string; compact?: boolean }) {
  const query = useMapQuery();
  const [status, setStatus] = useState("");
  const [fallback, setFallback] = useState(false);
  const shareUrl = () =>
    serialize(window.location.href, {
      q: query.search,
      schoolLevel: query.schoolLevel,
      indicator: query.indicatorId,
      region: query.regionCode,
      compareRegion: query.compareRegion,
      view: query.view,
      issue: query.issueId,
      issueMetric: query.issueMetric,
      issueLevel: query.issueLevel,
      zeroEntrants: query.zeroEntrants ? "on" : "off",
    });
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl());
      setFallback(false);
      setStatus("링크를 복사했습니다.");
    } catch {
      setFallback(true);
      setStatus("주소를 선택해 복사하세요.");
    }
  };
  const content = (
    <section
      aria-label="현재 탐색 조건"
      className="mb-4 space-y-2 border-b border-line pb-3"
    >
      <p className="text-xs font-semibold">현재 탐색 조건</p>
      <div className="flex flex-wrap gap-1.5">
        <button
          className={chip}
          aria-label="지표 초기화"
          onClick={() => query.setIndicator(DEFAULT_INDICATOR_ID)}
        >
          지표: {title} ×
        </button>
        {query.regionCode ? (
          <button
            className={chip}
            aria-label="지역 조건 해제"
            onClick={() => query.setRegion(null)}
          >
            {regionName(query.regionCode)} ×
          </button>
        ) : (
          <span className="self-center text-xs text-ink-muted">전체 지역</span>
        )}
        {query.compareRegion && (
          <button
            className={chip}
            aria-label="비교 지역 해제"
            onClick={() => query.setCompareRegion(null)}
          >
            비교: {regionName(query.compareRegion)} ×
          </button>
        )}
        {query.schoolLevel !== "all" && (
          <button
            className={chip}
            aria-label="학교급 조건 해제"
            onClick={() => query.setSchoolLevel("all")}
          >
            {SCHOOL_LEVEL_LABELS[query.schoolLevel]} ×
          </button>
        )}
        {query.search && (
          <button
            className={chip}
            aria-label="검색어 조건 해제"
            onClick={() => query.setSearch("")}
          >
            검색: {query.search} ×
          </button>
        )}
      </div>
      <p className="text-[11px] leading-relaxed text-ink-muted">
        학교명·학교급 검색은 학교 목록과 학교 지도에 적용됩니다. 시군 통계는
        해당 지표의 전체 집계입니다.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={chip}
          onClick={() => {
            query.resetFilters();
            query.setIndicator(DEFAULT_INDICATOR_ID);
          }}
        >
          전체 조건 초기화
        </button>
        <button
          type="button"
          className={`${chip} text-accent-text`}
          onClick={copy}
        >
          링크 복사
        </button>
      </div>
      <p role="status" className="text-xs text-ink-muted">
        {status}
      </p>
      {fallback && (
        <label className="block text-xs">
          공유 주소
          <input
            readOnly
            type="url"
            value={shareUrl()}
            onFocus={(event) => event.target.select()}
            className="mt-1 min-h-11 w-full rounded border border-line bg-surface px-2"
          />
        </label>
      )}
    </section>
  );
  return compact ? <details className="mb-3 text-xs"><summary className="min-h-11 cursor-pointer py-2 text-ink-muted">탐색 조건 · {query.regionCode ? regionName(query.regionCode) : "전체 지역"}{query.search || query.schoolLevel !== "all" ? " · 학교 검색 적용" : ""} · 공유</summary>{content}</details> : content;
}
