import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";

import RegionPanel from "@/components/panels/RegionPanel";
import { REGION_CODES } from "@/lib/geo/regions";
import { INDICATORS } from "@/lib/indicators/registry";
import { shareOfProvince, valueMap } from "@/lib/stats";
import { formatShare } from "@/lib/tooltipText";
import { useMapQuery } from "@/lib/state/urlState";
import type { IndicatorDef, IndicatorFile, Manifest, SeriesFile } from "@/lib/indicators/types";
import type { School, SchoolsFile } from "@/lib/schools/types";
import type { ClosedSchoolRow, ClosedSchoolsFile } from "@/lib/closedSchools/types";

const REGION = "52110"; // 전주시
const OTHER_REGION = "52130"; // 군산시
const PROVINCE = "52000";

function genericFile(id: string): IndicatorFile {
  return {
    id,
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: `${id} 출처`, url: `https://example.com/${id}`, year: 2026 },
    rows: [
      { regionCode: REGION, value: 100 },
      { regionCode: OTHER_REGION, value: 40 },
      { regionCode: PROVINCE, value: 140 },
    ],
  };
}

/** students_total mirrors the task brief's own aria-live example (70,851명, 1위) — 전주시 is the largest of the 3 fixture regions. */
function studentsTotalFile(): IndicatorFile {
  return {
    id: "students_total",
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "한국교육개발원 교육통계서비스(KESS) 교육기본통계 학교별 데이터셋", url: "https://kess.kedi.re.kr/contents/dataset", year: 2026 },
    rows: [
      { regionCode: REGION, value: 70851 },
      { regionCode: OTHER_REGION, value: 50000 },
      { regionCode: "52140", value: 30000 },
      { regionCode: PROVINCE, value: 150851 },
    ],
  };
}

function studentsTotalSeries(): SeriesFile {
  return {
    id: "students_total",
    rows: [
      { regionCode: REGION, year: 2022, value: 74000 },
      { regionCode: REGION, year: 2023, value: 73000 },
      { regionCode: REGION, year: 2024, value: 72000 },
      { regionCode: REGION, year: 2025, value: 71500 },
      { regionCode: REGION, year: 2026, value: 70851 },
    ],
  };
}

function manifestFixture(): Manifest {
  return { latestYear: 2026, indicators: {}, builtAt: "2026-01-01T00:00:00.000Z", sources: [] };
}

function schoolFixture(overrides: Partial<School> & Pick<School, "id" | "regionCode">): School {
  return {
    name: `학교${overrides.id}`,
    level: "elem",
    status: "운영",
    branch: false,
    lat: 35.8,
    lng: 127.1,
    students: 100,
    classes: 5,
    teachers: 10,
    studentsPerClass: 20,
    small: false,
    ...overrides,
  };
}

const NO_LOCATION_REASON = "특수학교는 위치 표준데이터(2026-03-20)에 없음";

/** 5 schools in REGION (전주시): unsorted by students on purpose, so sort-order assertions are meaningful; one is a 분교장, one is 소규모, levels span elem/mid/high/special. `special1` has no coordinates (lat/lng null + locationMissingReason) — mirrors real data, where every 특수학교 row is like this (fix-round-1). Plus 1 school in OTHER_REGION (must never appear). */
function schoolsFixture(): SchoolsFile {
  return {
    referenceDate: { location: "2026-03-20", stats: "2026-04-01" },
    source: {
      location: { name: "한국교육시설안전원 초중등학교위치 표준데이터", url: "https://example.com/location", referenceDate: "2026-03-20" },
      stats: { name: "KESS", url: "https://example.com/kess", referenceDate: "2026-04-01" },
    },
    schools: [
      schoolFixture({ id: "mid1", regionCode: REGION, name: "전주중학교", level: "mid", students: 300, classes: 12, studentsPerClass: 25 }),
      schoolFixture({ id: "small1", regionCode: REGION, name: "전주소규모초등학교", level: "elem", students: 40, classes: 4, studentsPerClass: 10, small: true }),
      schoolFixture({ id: "high1", regionCode: REGION, name: "전주고등학교", level: "high", students: 500, classes: 15, studentsPerClass: 33.3 }),
      schoolFixture({ id: "branch1", regionCode: REGION, name: "전주분교", level: "elem", branch: true, students: 15, classes: 1, studentsPerClass: 15, small: true }),
      schoolFixture({
        id: "special1",
        regionCode: REGION,
        name: "전주특수학교",
        level: "special",
        students: 80,
        classes: 8,
        studentsPerClass: 10,
        lat: null,
        lng: null,
        locationMissingReason: NO_LOCATION_REASON,
      }),
      schoolFixture({ id: "other1", regionCode: OTHER_REGION, name: "군산초등학교", level: "elem", students: 999 }),
    ],
  };
}

function closedSchoolRow(overrides: Partial<ClosedSchoolRow> & Pick<ClosedSchoolRow, "name" | "year">): ClosedSchoolRow {
  return {
    regionCode: REGION,
    level: "elem",
    usage: "미활용",
    buildingArea: 100,
    siteArea: 200,
    address: "전북특별자치도 전주시 어딘가",
    ...overrides,
  };
}

/** 2 폐교 in REGION(전주시) — different years to pin the "최신 연도 먼저" sort — plus 1 in OTHER_REGION (must never appear). */
function closedSchoolsFixture(): ClosedSchoolsFile {
  return {
    referenceDate: "2026-07-16",
    publishedAt: "2026-07-20",
    source: { name: "전북특별자치도교육청 폐교재산 현황(공공데이터포털)", url: "https://example.com/closed-schools", year: 2026 },
    rows: [
      closedSchoolRow({ name: "전주오래된폐교", year: 2005, usage: "자체활용", level: "mid" }),
      closedSchoolRow({ name: "전주최근폐교", year: 2023, usage: "미활용", level: "high" }),
      closedSchoolRow({ regionCode: OTHER_REGION, name: "군산폐교", year: 2020 }),
    ],
  };
}

function bundleFixture() {
  const indicators: Record<string, IndicatorFile> = {};
  const series: Record<string, SeriesFile> = {};
  for (const def of INDICATORS as IndicatorDef[]) {
    indicators[def.id] = def.id === "students_total" ? studentsTotalFile() : genericFile(def.id);
    if (def.aggregate.kind !== "external") {
      series[def.id] = def.id === "students_total" ? studentsTotalSeries() : { id: def.id, rows: [] };
    }
  }
  return {
    indicators,
    series,
    manifest: manifestFixture(),
    schools: schoolsFixture(),
    closedSchools: closedSchoolsFixture(),
  };
}

function renderSelected(
  searchParams: string,
  opts: Parameters<typeof withNuqsTestingAdapter>[0] = {},
  panelProps: { highlightedSchoolId?: string | null; onHighlightSchool?: (id: string | null) => void } = {},
) {
  return render(
    <RegionPanel
      bundle={bundleFixture()}
      highlightedSchoolId={panelProps.highlightedSchoolId ?? null}
      onHighlightSchool={panelProps.onHighlightSchool ?? (() => {})}
    />,
    {
      wrapper: withNuqsTestingAdapter({ searchParams, ...opts }),
    },
  );
}

describe("RegionPanel", () => {
  it("renders nothing when no region is selected (defensive — Dashboard only mounts it once one is)", () => {
    const { container } = render(
      <RegionPanel bundle={bundleFixture()} highlightedSchoolId={null} onHighlightSchool={() => {}} />,
      { wrapper: withNuqsTestingAdapter({ searchParams: "" }) },
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the region name as a heading", () => {
    renderSelected(`?region=${REGION}`);
    expect(screen.getByRole("heading", { name: "전주시" })).toBeInTheDocument();
  });

  it("shows the current indicator's label, formatted value, and unit", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    expect(screen.getByTestId("region-panel-current-label")).toHaveTextContent("학생수");
    expect(screen.getByTestId("region-panel-current-value")).toHaveTextContent("70,851");
    expect(screen.getByTestId("region-panel-current-value")).toHaveTextContent(/^70,851명$/);
  });

  it("shows the rank out of 14 시군, derived from REGION_CODES.length (fix round 1, review finding #4 — not hardcoded)", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    expect(screen.getByText(`${REGION_CODES.length}개 시군 중 1위`)).toBeInTheDocument();
  });

  it("shows '전북 대비 비중' (share, not a signed delta) for students_total, a count-kind indicator (Task 5, Section D)", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    const file = studentsTotalFile();
    const expectedShare = shareOfProvince(valueMap(file), REGION)!;
    // 70851 / 150851 * 100
    expect(screen.getByTestId("region-panel-delta")).toHaveTextContent(
      `전북 대비 비중 ${formatShare(expectedShare)}`,
    );
    // Never signed (a share isn't a directional delta).
    expect(screen.getByTestId("region-panel-delta")).not.toHaveTextContent(/[+-]\d/);
  });

  it("shows '전북 평균 대비' with a signed delta for a ratio-kind indicator", () => {
    renderSelected(`?region=${REGION}&indicator=students_per_class`);
    // genericFile: REGION=100, OTHER_REGION=40, PROVINCE=140 -> delta = 100-140 = -40
    expect(screen.getByTestId("region-panel-delta")).toHaveTextContent(/전북 평균 대비 -/);
  });

  it("shows the current indicator's description in the current-indicator card (Task 5, Section C)", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    const def = INDICATORS.find((d) => d.id === "students_total")!;
    expect(screen.getByTestId("region-panel-description")).toHaveTextContent(def.description);
  });

  it("omits the caveat line for an indicator with none (students_total)", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    expect(screen.queryByTestId("region-panel-caveat")).not.toBeInTheDocument();
  });

  it("shows the caveat line for an indicator that has one (small_schools)", () => {
    renderSelected(`?region=${REGION}&indicator=small_schools`);
    const smallSchoolsDef = INDICATORS.find((d) => d.id === "small_schools")!;
    expect(smallSchoolsDef.caveat).toBeTruthy();
    expect(screen.getByTestId("region-panel-caveat")).toHaveTextContent(smallSchoolsDef.caveat!);
  });

  it("renders annual values when a series file exists for the current indicator", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    expect(screen.getByRole("img", { name: /2022년부터 2026년까지/ })).toBeInTheDocument();
    expect(screen.queryByText("추이 없음")).not.toBeInTheDocument();
  });

  it("shows the underlying student history for the multi-year change indicator", () => {
    renderSelected(`?region=${REGION}&indicator=students_change_5y`);
    expect(screen.getByRole("region", { name: "전주시 학생수 시계열 추이" })).toBeInTheDocument();
    expect(screen.queryByText("추이 없음")).not.toBeInTheDocument();
  });

  it("lists all 18 registry indicators in the 다른 지표 table", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    const rows = screen.getAllByTestId(/^other-indicator-/);
    expect(rows).toHaveLength(INDICATORS.length);
    expect(rows).toHaveLength(18);
  });

  // Fix round 2, finding 4 — this table used to render raw `otherDef.label`,
  // so students_change_5y showed the static "학생수 5년 증감률" here while the
  // menu button/Legend/current-indicator header (all of which already called
  // displayLabel()) showed the dynamic "학생수 2022→2026 증감률" for the same
  // indicator. bundleFixture()'s students_total series spans 2022-2026.
  it("shows the dynamic students_change_5y label (via displayLabel) in the 다른 지표 table, not the static '5년' label", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    const row = screen.getByTestId("other-indicator-students_change_5y");
    expect(row).toHaveTextContent("학생수 2022→2026 증감률");
    expect(row).not.toHaveTextContent("학생수 5년 증감률");
  });

  it("highlights the current indicator's row in the 다른 지표 table", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    expect(screen.getByTestId("other-indicator-students_total")).toHaveAttribute("aria-current", "true");
    expect(screen.getByTestId("other-indicator-schools_total")).not.toHaveAttribute("aria-current");
  });

  it("clicking the value cell (not just the label button) switches the map indicator — the whole row is clickable (fix round 1, review finding #3)", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    renderSelected(`?region=${REGION}&indicator=students_total`, { onUrlUpdate, hasMemory: true });

    const row = screen.getByTestId("other-indicator-schools_total").closest("tr");
    if (!row) throw new Error("other-indicator-schools_total row not found");
    const valueCell = within(row).getAllByRole("cell")[1]; // [label (button), value, rank]

    await user.click(valueCell);

    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall?.searchParams.get("indicator")).toBe("schools_total");
    // setIndicator replaces the history entry (doesn't clutter back/forward).
    expect(lastCall?.options.history).toBe("replace");
  });

  it("clicking the label button itself still updates exactly once (its handler stops propagation so the row's own onClick doesn't also fire)", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    renderSelected(`?region=${REGION}&indicator=students_total`, { onUrlUpdate, hasMemory: true });

    await user.click(screen.getByTestId("other-indicator-schools_total"));

    const indicatorCalls = onUrlUpdate.mock.calls.filter(
      (call) => call[0].searchParams.get("indicator") === "schools_total",
    );
    expect(indicatorCalls).toHaveLength(1);
  });

  describe("학교 목록 (Task 4B)", () => {
    it("lists only the selected region's schools, sorted by students descending", () => {
      renderSelected(`?region=${REGION}`);
      const rows = screen.getAllByTestId(/^school-row-/);
      expect(rows).toHaveLength(5); // REGION has 5; OTHER_REGION's school must be excluded
      const names = rows.map((r) => r.textContent);
      expect(names[0]).toContain("전주고등학교"); // 500
      expect(names[1]).toContain("전주중학교"); // 300
      expect(names[2]).toContain("전주특수학교"); // 80
      expect(names[3]).toContain("전주소규모초등학교"); // 40
      expect(names[4]).toContain("전주분교"); // 15
      expect(screen.queryByText("군산초등학교")).not.toBeInTheDocument();
    });

    it("shows a summary line: 학교 N개 · 소규모 M개", () => {
      renderSelected(`?region=${REGION}`);
      // 5 schools total, 2 소규모 (전주소규모초등학교 40명, 전주분교 15명)
      expect(screen.getByText(/학교 5개/)).toBeInTheDocument();
      expect(screen.getByText(/소규모 2개/)).toBeInTheDocument();
    });

    it("shows the 위치 기준 caption from bundle.schools.referenceDate.location", () => {
      renderSelected(`?region=${REGION}`);
      expect(screen.getByText(/위치 기준 2026-03-20/)).toBeInTheDocument();
    });

    it("shows 학교급 filter chips: 전체/초/중/고/특수", () => {
      renderSelected(`?region=${REGION}`);
      expect(screen.getByRole("button", { name: "전체" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "초" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "중" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "고" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "특수" })).toBeInTheDocument();
    });

    it("clicking a filter chip narrows the list to that 학교급 only", async () => {
      const user = userEvent.setup();
      renderSelected(`?region=${REGION}`);

      await user.click(screen.getByRole("button", { name: "초" }));

      const rows = screen.getAllByTestId(/^school-row-/);
      expect(rows).toHaveLength(2); // 전주소규모초등학교 + 전주분교 (both elem)
      expect(rows.map((r) => r.textContent).join("")).toContain("전주소규모초등학교");
      expect(rows.map((r) => r.textContent).join("")).toContain("전주분교");
      expect(screen.queryByText("전주고등학교")).not.toBeInTheDocument();
      // Summary reflects the filtered set, matching the table below it.
      expect(screen.getByText(/학교 2개/)).toBeInTheDocument();
      expect(screen.getByText(/소규모 2개/)).toBeInTheDocument();
    });

    it("clicking 전체 after a filter restores the full list", async () => {
      const user = userEvent.setup();
      renderSelected(`?region=${REGION}`);

      await user.click(screen.getByRole("button", { name: "고" }));
      expect(screen.getAllByTestId(/^school-row-/)).toHaveLength(1);

      await user.click(screen.getByRole("button", { name: "전체" }));
      expect(screen.getAllByTestId(/^school-row-/)).toHaveLength(5);
    });

    it("shows a 급 배지, 소규모 배지, and 분교장 표시 on the relevant rows", () => {
      renderSelected(`?region=${REGION}`);
      const branchRow = screen.getByTestId("school-row-branch1");
      expect(branchRow).toHaveTextContent("분교");
      const smallRow = screen.getByTestId("school-row-small1");
      expect(smallRow).toHaveTextContent("소규모");
      const highRow = screen.getByTestId("school-row-high1");
      expect(highRow).toHaveTextContent("고");
    });

    it("clicking a row calls onHighlightSchool with that school's id", async () => {
      const user = userEvent.setup();
      const onHighlightSchool = vi.fn();
      renderSelected(`?region=${REGION}`, {}, { onHighlightSchool });

      await user.click(screen.getByTestId("school-row-high1"));

      expect(onHighlightSchool).toHaveBeenCalledWith("high1");
    });

    it("clicking the already-highlighted row again calls onHighlightSchool(null) (toggle off)", async () => {
      const user = userEvent.setup();
      const onHighlightSchool = vi.fn();
      renderSelected(`?region=${REGION}`, {}, { highlightedSchoolId: "high1", onHighlightSchool });

      await user.click(screen.getByTestId("school-row-high1"));

      expect(onHighlightSchool).toHaveBeenCalledWith(null);
    });

    it("visually marks the highlighted row (aria-current)", () => {
      renderSelected(`?region=${REGION}`, {}, { highlightedSchoolId: "high1" });
      expect(screen.getByTestId("school-row-high1")).toHaveAttribute("aria-current", "true");
      expect(screen.getByTestId("school-row-mid1")).not.toHaveAttribute("aria-current");
    });

    describe("좌표 없는 학교 (특수학교, fix-round-1)", () => {
      it("shows a 위치 없음 badge on the row, with the reason as its title", () => {
        renderSelected(`?region=${REGION}`);
        const row = screen.getByTestId("school-row-special1");
        const badge = within(row).getByText("위치 없음");
        expect(badge).toHaveAttribute("title", NO_LOCATION_REASON);
      });

      it("does not show the badge on a row that has coordinates", () => {
        renderSelected(`?region=${REGION}`);
        const row = screen.getByTestId("school-row-high1");
        expect(within(row).queryByText("위치 없음")).not.toBeInTheDocument();
      });

      it("summary line adds '위치 없음 K개' when the filtered set includes a no-coordinate school", () => {
        renderSelected(`?region=${REGION}`); // 전체 filter — includes special1
        expect(screen.getByText(/위치 없음 1개/)).toBeInTheDocument();
      });

      it("summary line omits '위치 없음' when the filtered set has no no-coordinate school", async () => {
        const user = userEvent.setup();
        renderSelected(`?region=${REGION}`);

        await user.click(screen.getByRole("button", { name: "고" })); // only high1 (has coordinates)

        expect(screen.queryByText(/위치 없음/)).not.toBeInTheDocument();
      });
    });

    describe("school row keyboard reachability (fix round, review finding #2)", () => {
      it("Tab from the last 학교급 chip lands on the school row's own button, and Enter toggles the highlight (aria-current), a second Enter clears it", async () => {
        const user = userEvent.setup();

        // A stateful harness: onHighlightSchool is wired back into
        // highlightedSchoolId (as Dashboard.tsx really does), so the SECOND
        // Enter press observes the highlight this component itself set on
        // the first press, rather than a static mock that never reflects it.
        function Harness() {
          const [highlightedSchoolId, setHighlightedSchoolId] = useState<string | null>(null);
          return (
            <RegionPanel
              bundle={bundleFixture()}
              highlightedSchoolId={highlightedSchoolId}
              onHighlightSchool={setHighlightedSchoolId}
            />
          );
        }
        render(<Harness />, { wrapper: withNuqsTestingAdapter({ searchParams: `?region=${REGION}` }) });

        // Seed focus on the last 학교급 chip (특수, immediately before the
        // school table in DOM order) and Tab exactly once — proves the row
        // button is the very next stop in the natural tab order (really
        // keyboard-reachable), not just focusable via .focus().
        screen.getByRole("button", { name: "특수" }).focus();
        await user.tab();
        const button = screen.getByRole("button", { name: "전주고등학교" });
        expect(button).toHaveFocus();
        expect(button).not.toHaveAttribute("aria-current");

        await user.keyboard("{Enter}");
        expect(button).toHaveAttribute("aria-current", "true");
        expect(screen.getByTestId("school-row-high1")).toHaveAttribute("aria-current", "true");

        await user.keyboard("{Enter}");
        expect(button).not.toHaveAttribute("aria-current");
        expect(screen.getByTestId("school-row-high1")).not.toHaveAttribute("aria-current");
      });

      it("clicking the row button stops propagation — onHighlightSchool fires exactly once, not twice via the row's own onClick", async () => {
        const user = userEvent.setup();
        const onHighlightSchool = vi.fn();
        renderSelected(`?region=${REGION}`, {}, { onHighlightSchool });

        await user.click(screen.getByRole("button", { name: "전주고등학교" }));

        expect(onHighlightSchool).toHaveBeenCalledTimes(1);
        expect(onHighlightSchool).toHaveBeenCalledWith("high1");
      });
    });

    describe("학교급 필터 리셋 (fix round, review finding #3)", () => {
      it("resets the 학교급 filter to 전체 when the selected region changes", async () => {
        const user = userEvent.setup();

        function Harness() {
          const { setRegion } = useMapQuery();
          return (
            <>
              <button type="button" onClick={() => setRegion(OTHER_REGION)}>
                switch-region
              </button>
              <RegionPanel bundle={bundleFixture()} highlightedSchoolId={null} onHighlightSchool={() => {}} />
            </>
          );
        }
        render(<Harness />, {
          wrapper: withNuqsTestingAdapter({ searchParams: `?region=${REGION}`, hasMemory: true }),
        });

        // Narrow to 고 (전주고등학교 only) within REGION.
        await user.click(screen.getByRole("button", { name: "고" }));
        expect(screen.getAllByTestId(/^school-row-/)).toHaveLength(1);

        await user.click(screen.getByText("switch-region"));
        // Wait for the region switch to actually propagate through
        // useMapQuery before asserting — OTHER_REGION's heading appearing
        // confirms the re-render happened.
        await screen.findByRole("heading", { name: "군산시" });

        // If the filter hadn't reset, it would still be "고" — but
        // OTHER_REGION's only fixture school (군산초등학교) is 'elem', so the
        // list would incorrectly show 0 rows.
        expect(screen.getByRole("button", { name: "전체" })).toHaveAttribute("aria-pressed", "true");
        const rows = screen.getAllByTestId(/^school-row-/);
        expect(rows).toHaveLength(1);
        expect(rows[0]).toHaveTextContent("군산초등학교");
      });
    });
  });

  describe("폐교 목록 (Task 5)", () => {
    it("renders a collapsible 폐교 목록 section with the region's own count", () => {
      renderSelected(`?region=${REGION}`);
      const section = screen.getByTestId("closed-schools-section");
      expect(section.tagName).toBe("DETAILS");
      expect(screen.getByText("폐교 목록 (2개)")).toBeInTheDocument();
    });

    it("lists only the selected region's 폐교 rows, most recent 폐교연도 first", () => {
      renderSelected(`?region=${REGION}`);
      const rows = screen.getAllByTestId(/^closed-school-row-/);
      expect(rows).toHaveLength(2);
      expect(rows[0]).toHaveTextContent("전주최근폐교");
      expect(rows[0]).toHaveTextContent("2023");
      expect(rows[1]).toHaveTextContent("전주오래된폐교");
      expect(rows[1]).toHaveTextContent("2005");
      expect(screen.queryByText("군산폐교")).not.toBeInTheDocument();
    });

    it("shows 급 배지 and 활용현황 (usage) on each row", () => {
      renderSelected(`?region=${REGION}`);
      const row = screen.getByTestId("closed-school-row-전주최근폐교-2023");
      expect(row).toHaveTextContent("고"); // SCHOOL_LEVEL_LABELS.high
      expect(row).toHaveTextContent("미활용");
    });

    it("shows a 'no history' message when the region has no 폐교 rows", () => {
      renderSelected("?region=52140"); // 익산시 — no closed-schools fixture rows for this region
      expect(screen.getByText("폐교 목록 (0개)")).toBeInTheDocument();
      expect(screen.getByText("폐교 이력이 없습니다")).toBeInTheDocument();
    });
  });

  it("shows the source name and reference date (기준 YYYY.M.D, via referenceDateLabel — Task 5 fix round 1: TopBar's own caption now uses a different, raw-ISO format for a different anchor indicator, see TopBar.test.tsx)", () => {
    renderSelected(`?region=${REGION}&indicator=students_total`);
    expect(
      screen.getByText(/한국교육개발원 교육통계서비스\(KESS\) 교육기본통계 학교별 데이터셋/),
    ).toBeInTheDocument();
    expect(screen.getByText(/기준 2026\.4\.1/)).toBeInTheDocument();
  });

  it("clicking the close (✕) button clears the region URL param", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    renderSelected(`?region=${REGION}`, { onUrlUpdate, hasMemory: true });

    await user.click(screen.getByRole("button", { name: "선택 해제" }));

    const lastCall = onUrlUpdate.mock.calls.at(-1)?.[0];
    expect(lastCall?.searchParams.get("region")).toBeNull();
  });
});
