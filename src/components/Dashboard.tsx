"use client";

import { parseAsString, useQueryState } from "nuqs";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import IssueExplorer from "@/components/panels/IssueExplorer";
import { useIssueData } from "@/lib/issues/useIssueData";
import { issueById } from "@/lib/issues/registry";
import { buildIssueModel } from "@/lib/issues/model";
import SchoolExplorer from "@/components/panels/SchoolExplorer";
import { filterSchools, type SchoolFilters } from "@/lib/schools/filter";
import { hasCoordinates } from "@/components/map/layers/schoolLayers";
import MapShell from "@/components/map/MapShell";
import Footer from "@/components/panels/Footer";
import { chartValueText } from "@/lib/schools/chart";
import { buildMapMetric } from "@/lib/mapMetrics";
import RegionList from "@/components/panels/RegionList";
import RegionPanel from "@/components/panels/RegionPanel";
import TopBar from "@/components/panels/TopBar";
import { DataProvider, useData, useRetry } from "@/lib/data/DataProvider";
import type { DataBundle } from "@/lib/data/types";
import type { RegionCode } from "@/lib/geo/regions";
import { indicatorById } from "@/lib/indicators/registry";
import { MAP_VIEWS, useMapQuery } from "@/lib/state/urlState";

function CenteredMessage({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-full w-full items-center justify-center bg-paper px-6 text-center text-sm text-ink-muted">
      {children}
    </div>
  );
}

/**
 * Task 6, Section A.5 — DataProvider's error state: shows the underlying
 * cause (load.ts's fetchJson throws e.g. "loadBundle: failed to fetch
 * /data/regions.geojson (HTTP 404)" — filename + HTTP status already
 * embedded in the message for the common "file missing/renamed" case) and a
 * "다시 시도" button that re-runs the SAME load from scratch via
 * DataProvider's useRetry().
 */
function DataErrorMessage({ error }: { error: string }) {
  const retry = useRetry();
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-paper px-6 text-center text-sm text-ink-muted">
      <p>데이터를 불러오지 못했습니다.</p>
      <p className="max-w-md text-xs text-ink-muted">{error}</p>
      <button
        type="button"
        onClick={retry}
        className="rounded bg-ink/5 px-3 py-1.5 text-ink hover:bg-ink/15"
      >
        다시 시도
      </button>
    </div>
  );
}

function DashboardInner({
  bundle,
  indicatorId,
  regionCode,
  setRegion,
  exploreRequest,
}: {
  bundle: DataBundle;
  indicatorId: string;
  regionCode: RegionCode | null;
  setRegion: (code: RegionCode | null) => void;
  exploreRequest: number;
}) {
  const def = indicatorById(indicatorId);
  if (!def) throw new Error(`Dashboard: unknown indicatorId "${indicatorId}"`);
  const {
    view: tab,
    setView: setTab,
    issueId,
    issueMetric,
    setIssue,
    setIssueMetric,
    issueLevel, compareRegion, zeroEntrants,
  } = useMapQuery();
  const searchScope = issueId ?? "indicators";
  const [search, setSearch] = useState({
    scope: searchScope,
    name: "",
    level: "all" as SchoolFilters["level"],
  });
  const name = search.scope === searchScope ? search.name : "";
  const level = search.scope === searchScope ? search.level : "all";
  const setName = (next: string) =>
    setSearch({ scope: searchScope, name: next, level });
  const setLevel = (next: SchoolFilters["level"]) =>
    setSearch((previous) => ({
      scope: searchScope,
      name: previous.scope === searchScope ? previous.name : "",
      level: next,
    }));

  const { state: issueState, retry: retryIssues } = useIssueData(
    !!issueId ||
      tab === "issues" ||
      ["special_classes", "special_students", "zero_entrant_schools"].includes(
        indicatorId,
      ),
    bundle.schools,
  );
  const issueModel = useMemo(() => {
    const definition = issueById(issueId);
    return definition && issueState.status === "ready"
      ? buildIssueModel(bundle, issueState.data, definition, issueMetric, issueLevel)
      : null;
  }, [issueId, issueMetric, issueState, bundle, issueLevel]);
  const mapMetric = useMemo(
    () =>
      buildMapMetric(
        bundle,
        indicatorId,
        issueModel,
        issueState.status === "ready" ? issueState.data : null,
      ),
    [bundle, indicatorId, issueModel, issueState],
  );
  const needsFacts =
    !!issueId ||
    ["special_classes", "special_students", "zero_entrant_schools"].includes(
      indicatorId,
    );
  const metricPending = needsFacts && issueState.status !== "ready";
  const [panelOpen, setPanelOpen] = useState(false);
  const [highlightedSchoolId, setHighlightedSchoolId] = useQueryState(
    "school",
    parseAsString.withOptions({ history: "push", shallow: true }),
  );
  const [collapsed, setCollapsed] = useState(
    !regionCode && tab === "schools" && !highlightedSchoolId,
  );
  const [handledExplore, setHandledExplore] = useState(0);
  if (handledExplore !== exploreRequest) {
    setHandledExplore(exploreRequest);
    setCollapsed(false);
    setPanelOpen(typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches);
  }
  const [schoolFocusNonce, setSchoolFocusNonce] = useState(0);
  const panelRef = useRef<HTMLElement>(null);
  const panelButtonRef = useRef<HTMLButtonElement>(null);
  const panelReturnFocusRef = useRef<HTMLElement | null>(null);
  const filteredSchools = useMemo(
    () =>
      filterSchools(issueModel?.schools ?? bundle.schools.schools, {
        name,
        level,
        regionCode,
      }),
    [bundle.schools, name, level, regionCode, issueModel],
  );
  const mapSchools = useMemo(() => {
    if (!issueModel) return filteredSchools;
    const base = [...issueModel.schools];
    if (issueModel.issue.id === "special-education") {
      const ids = new Set(base.map(s => s.id));
      base.push(...bundle.schools.schools.filter(s => s.level === "special" && !ids.has(s.id)));
    }
    return filterSchools(base, { name, level, regionCode: null });
  }, [issueModel, filteredSchools, bundle, name, level]);
  const selectedSchool =
    mapSchools.find((s) => s.id === highlightedSchoolId) ?? null;
  useEffect(() => {
    if (highlightedSchoolId && !selectedSchool)
      void setHighlightedSchoolId(null, { history: "replace" });
  }, [highlightedSchoolId, selectedSchool, setHighlightedSchoolId]);

  useEffect(() => {
    if (!selectedSchool || tab === "statistics" || collapsed) return;
    if (window.matchMedia("(max-width: 1023px)").matches && !panelOpen) return;
    panelRef.current
      ?.querySelector('[aria-label="선택한 학교"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [selectedSchool, tab, collapsed, panelOpen]);

  useEffect(() => {
    if (!panelOpen) return;
    const previous =
      panelReturnFocusRef.current ??
      (document.activeElement as HTMLElement | null);
    const opener = panelButtonRef.current;
    panelRef.current
      ?.querySelector<HTMLButtonElement>('[aria-label="패널 닫기"]')
      ?.focus();
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopImmediatePropagation();
        setPanelOpen(false);
      }
    };
    document.addEventListener("keydown", close, true);
    return () => {
      document.removeEventListener("keydown", close, true);
      if (previous?.isConnected) previous.focus();
      else opener?.focus();
    };
  }, [panelOpen]);

  useEffect(() => {
    const compact = window.matchMedia("(max-width: 1023px)");
    const resize = () => {
      if (!compact.matches) setPanelOpen(false);
    };
    compact.addEventListener("change", resize);
    return () => compact.removeEventListener("change", resize);
  }, []);

  const selectSchool = (id: string | null, origin?: "map") => {
    if (issueModel && id) {
      const school = mapSchools.find(s => s.id === id);
      if (school && regionCode && school.regionCode !== regionCode) setRegion(school.regionCode as RegionCode);
    }
    setHighlightedSchoolId(id);
    if (id) setCollapsed(false);
    setSchoolFocusNonce((n) => n + 1);
    if (id && origin === "map") {
      if (tab === "statistics") setTab("schools");
      setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
      return;
    }
    if (
      id &&
      bundle.schools.schools.find((s) => s.id === id && hasCoordinates(s))
    )
      setPanelOpen(false);
  };
  const changeFilters = (filters: SchoolFilters) => {
    setName(filters.name);
    setLevel(filters.level);
    if (filters.regionCode !== regionCode)
      setRegion(filters.regionCode as RegionCode | null);
  };
  const showStatistics = (code: RegionCode) => {
    setRegion(code);
    setTab("statistics");
    setCollapsed(false);
    setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
  };

  return (
    <div className="flex min-h-0 flex-col overflow-hidden">
      <span
        aria-live="polite"
        className="sr-only"
        data-testid="indicator-announcement"
      >{`지표 변경: ${mapMetric.title}`}</span>
      <div className="relative flex min-h-0 flex-1 overflow-hidden">
        {panelOpen && (
          <button
            type="button"
            aria-label="패널 바깥 닫기"
            onClick={() => setPanelOpen(false)}
            className="fixed inset-0 z-40 bg-ink/20 lg:hidden"
          />
        )}
        <aside
          ref={panelRef}
          aria-label="학교 탐색 및 시군 통계"
          role={panelOpen ? "dialog" : undefined}
          aria-modal={panelOpen ? true : undefined}
          onKeyDown={(event) => {
            if (!panelOpen || event.key !== "Tab") return;
            const items = Array.from(
              event.currentTarget.querySelectorAll<HTMLElement>(
                'button, input, select, a[href], summary, [tabindex="0"]',
              ),
            ).filter(
              (el) =>
                el.getClientRects().length &&
                el.tabIndex >= 0 &&
                !el.hasAttribute("disabled"),
            );
            const first = items[0],
              last = items[items.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }}
          className={`${panelOpen ? "flex" : "hidden"} ${collapsed ? "lg:hidden" : "lg:flex"} fixed inset-x-0 bottom-0 z-50 max-h-[75%] flex-col rounded-t-2xl border-t border-line bg-surface shadow-xl lg:relative lg:inset-auto lg:z-10 lg:h-full lg:max-h-none lg:w-[360px] lg:shrink-0 lg:rounded-none lg:border-r lg:border-t-0 lg:shadow-none`}
        >
          <div className="flex shrink-0 items-center gap-1 border-b border-line px-3 py-2">
            <div
              role="tablist"
              aria-label="탐색 유형"
              className="flex flex-1 gap-1"
            >
              {MAP_VIEWS.map((value, index) => (
                <button
                  type="button"
                  role="tab"
                  id={`tab-${value}`}
                  aria-controls={`panel-${value}`}
                  aria-selected={tab === value}
                  tabIndex={tab === value ? 0 : -1}
                  key={value}
                  onClick={() => setTab(value)}
                  onKeyDown={(event) => {
                    if (
                      ["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                        event.key,
                      )
                    ) {
                      event.preventDefault();
                      const next =
                        event.key === "Home"
                          ? MAP_VIEWS[0]
                          : event.key === "End"
                            ? MAP_VIEWS[MAP_VIEWS.length - 1]
                            : MAP_VIEWS[
                                (index +
                                  (event.key === "ArrowRight"
                                    ? 1
                                    : MAP_VIEWS.length - 1)) %
                                  MAP_VIEWS.length
                              ];
                      setTab(next);
                      document.getElementById(`tab-${next}`)?.focus();
                    }
                  }}
                  className={`min-h-11 rounded-lg px-3 text-sm ${tab === value ? "bg-accent-soft font-semibold text-accent-text" : "text-ink-muted hover:bg-paper"}`}
                >
                  {value === "schools"
                    ? "학교 탐색"
                    : value === "issues"
                      ? "교육문제"
                      : "시군 통계"}
                </button>
              ))}
            </div>
            <button
              type="button"
              aria-label="패널 닫기"
              onClick={() => {
                setPanelOpen(false);
                setCollapsed(true);
              }}
              className="min-h-11 min-w-11 rounded-lg text-ink-muted hover:bg-paper"
            >
              ✕
            </button>
          </div>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            role="tabpanel"
            id={`panel-${tab}`}
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "schools" ? (
              <SchoolExplorer
                metric={mapMetric}
                schools={filteredSchools}
                filters={{ name, level, regionCode }}
                onFilters={changeFilters}
                selectedSchoolId={highlightedSchoolId}
                selectedSchool={selectedSchool}
                onSelect={selectSchool}
                onStatistics={showStatistics}
              />
            ) : tab === "issues" ? (
              issueState.status === "ready" ? (
                <IssueExplorer
                  bundle={bundle}
                  data={issueState.data}
                  model={issueModel}
                  issueId={issueId}
                  region={regionCode}
                  schools={filteredSchools}
                  selectedSchool={selectedSchool}
                  onIssue={(id) => {
                    setHighlightedSchoolId(null);
                    setIssue(id);
                  }}
                  onMetric={(metric) => {
                    setHighlightedSchoolId(null);
                    setIssueMetric(metric);
                  }}
                  onRegion={setRegion}
                  onSchool={selectSchool}
                  onStatistics={showStatistics}
                  onSearch={(code) => {
                    setName("");
                    setLevel("all");
                    setRegion(code);
                    setTab("schools");
                  }}
                />
              ) : issueState.status === "error" ? (
                <div role="alert" className="space-y-3 text-sm">
                  <p>{issueState.message}</p>
                  <button
                    className="min-h-11 rounded border border-line px-3"
                    onClick={retryIssues}
                  >
                    다시 시도
                  </button>
                </div>
              ) : (
                <p role="status" className="py-8 text-sm text-ink-muted">
                  교육문제 자료 불러오는 중…
                </p>
              )
            ) : (
              <>
                {issueModel ? (
                  <section
                    aria-label="선택 지표 시군 비교"
                    className="space-y-3"
                  >
                    <h2 className="font-semibold">{issueModel.title}</h2>
                    <p className="text-xs text-ink-muted">
                      {issueModel.date} · 시군 전체 집계
                    </p>
                    <p className="text-sm">{issueModel.provinceText}</p>
                    <ul className="space-y-1">
                      {issueModel.regions.map((row) => (
                        <li key={row.code}>
                          <button
                            className="flex min-h-11 w-full items-center justify-between rounded border border-line p-3 text-sm aria-pressed:bg-accent-soft"
                            aria-pressed={regionCode === row.code}
                            onClick={() => setRegion(row.code)}
                          >
                            <span>
                              {
                                bundle.regions.features.find(
                                  (f) => f.properties.code === row.code,
                                )?.properties.name
                              }
                            </span>
                            <span>{row.text}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="text-xs text-ink-muted">{issueModel.note}</p>
                  </section>
                ) : regionCode ? (
                  <RegionPanel
                    bundle={bundle}
                    highlightedSchoolId={highlightedSchoolId}
                    onHighlightSchool={selectSchool}
                    showSchools={false}
                  />
                ) : (
                  <RegionList bundle={bundle} />
                )}
                <footer
                  role="contentinfo"
                  aria-label="데이터 출처"
                  className="mt-4"
                >
                  <Footer manifest={bundle.manifest} />
                </footer>
              </>
            )}
          </div>
        </aside>
        <main className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          <MapShell
            mapMetric={mapMetric}
            indicatorId={indicatorId}
            selectedCode={regionCode}
            onSelect={(code) => {
              setRegion(code);
              if (code) {
                setCollapsed(false);
              }
            }}
            highlightedSchoolId={highlightedSchoolId}
            onHighlightSchool={selectSchool}
            schools={mapSchools}
            compareCode={compareRegion}
            emphasizeZero={zeroEntrants}
            schoolFocusNonce={schoolFocusNonce}
            issueModel={issueModel}
            schoolFacts={issueState.status === "ready" ? issueState.data : null}
            statisticsVisible={
              tab === "statistics" || mapMetric.kind === "region" || !!mapMetric.regionOverlay
            }
            interactionBlocked={panelOpen}
          />
          {issueModel && !selectedSchool && <div className="pointer-events-none absolute left-3 right-3 top-16 z-10 max-w-sm rounded-xl border border-line bg-surface/95 p-3 shadow-sm lg:hidden"><p className="text-xs font-semibold">{issueModel.issue.title}</p><p className="mt-1 text-xs">{regionCode ? `${bundle.regions.features.find(f => f.properties.code === regionCode)?.properties.name} · ${issueModel.regions.find(r => r.code === regionCode)?.text}` : issueModel.provinceText}</p></div>}
          {metricPending && (
            <div
              role="status"
              className="absolute inset-0 z-20 flex items-center justify-center bg-surface/90 p-6 text-sm"
            >
              {issueState.status === "error" ? (
                <div>
                  <p>선택 지표 자료를 불러오지 못했습니다.</p>
                  <button className="min-h-11 underline" onClick={retryIssues}>
                    다시 시도
                  </button>
                </div>
              ) : (
                "선택한 교육지표 자료를 불러오는 중…"
              )}
            </div>
          )}
          <button
            ref={panelButtonRef}
            type="button"
            onClick={(event) => {
              panelReturnFocusRef.current = event.currentTarget;
              setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
              setCollapsed(false);
            }}
            className={`${collapsed ? "" : "lg:hidden"} absolute left-3 top-3 z-10 min-h-11 rounded-lg border border-line bg-surface px-3 text-sm font-medium shadow-sm`}
          >
            학교·통계
          </button>
          {selectedSchool && (
            <button
              type="button"
              aria-label={`${selectedSchool.name} 학교 정보 보기`}
              onClick={(event) => {
                panelReturnFocusRef.current = event.currentTarget;
                setPanelOpen(window.matchMedia("(max-width: 1023px)").matches);
                if (tab !== "issues") setTab("schools");
                requestAnimationFrame(() =>
                  panelRef.current
                    ?.querySelector('[aria-label="선택한 학교"]')
                    ?.scrollIntoView({ block: "nearest" }),
                );
              }}
              className={`${panelOpen ? "hidden" : ""} absolute bottom-4 left-16 right-3 z-10 rounded-xl border border-accent/30 bg-surface p-3 text-left text-sm shadow-lg lg:hidden`}
            >
              <span className="font-semibold">{selectedSchool.name}</span>
              <span className="ml-2 text-xs text-ink-muted">
                학교 정보 보기
              </span>
              {mapMetric.kind !== "region" && (
                <span className="block text-xs text-ink-muted">
                  {mapMetric.title} ·{" "}
                  {chartValueText(
                    mapMetric.value(selectedSchool),
                    mapMetric.unit,
                  )}
                </span>
              )}
            </button>
          )}
        </main>
      </div>
    </div>
  );
}

function DashboardBody() {
  // URL is the source of truth for indicatorId (nuqs) — this replaces Task
  // 2's local useState. Called unconditionally here (not inside the
  // status === "ready" branch below), so the URL is established immediately
  // and TopBar (rendered regardless of load status) always has it.
  const { indicatorId, regionCode, setRegion } = useMapQuery();
  const state = useData();
  const [exploreRequest, setExploreRequest] = useState(0);
  const bundle = state.status === "ready" ? state.bundle : null;

  return (
    <div className="grid h-full w-full min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-paper text-ink">
      <TopBar indicatorId={indicatorId} bundle={bundle} onExploreIssues={() => setExploreRequest(n => n + 1)} />
      {state.status === "loading" && (
        <CenteredMessage>데이터 불러오는 중…</CenteredMessage>
      )}
      {state.status === "error" && <DataErrorMessage error={state.error} />}
      {state.status === "ready" && (
        <DashboardInner
          bundle={state.bundle}
          exploreRequest={exploreRequest}
          indicatorId={indicatorId}
          regionCode={regionCode}
          setRegion={setRegion}
        />
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <DataProvider>
      <DashboardBody />
    </DataProvider>
  );
}
