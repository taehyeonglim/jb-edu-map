import { describe, expect, it, vi } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import type { IssueMapModel } from "@/lib/issues/types";
import { PUBLISHED_ISSUES } from "@/lib/issues/registry";

import MapFallback from "@/components/map/MapFallback";
import { REGIONS } from "@/lib/geo/regions";
import type { IndicatorFile, SeriesFile } from "@/lib/indicators/types";
import type { School } from "@/lib/schools/types";

/** Deliberately NOT REGIONS' declaration order — exercises real rank sorting (mirrors tests/components/RegionList.test.tsx's own fixture). */
const VALUES: Record<string, number> = {
  "52110": 70851, // 전주시 — rank 1
  "52130": 50000, // 군산시 — rank 2
  "52140": 1000, // 익산시 — rank 3 (smallest of the 3 given here)
};

function studentsTotalFile(): IndicatorFile {
  return {
    id: "students_total",
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "KESS 테스트", url: "https://example.com", year: 2026 },
    rows: [
      ...Object.entries(VALUES).map(([regionCode, value]) => ({ regionCode, value })),
      { regionCode: "52000", value: Object.values(VALUES).reduce((a, b) => a + b, 0) },
      // Every other 시군: no data (null) — a realistic partial fixture, not all 14.
      ...REGIONS.map((r) => r.code)
        .filter((code) => !(code in VALUES))
        .map((regionCode) => ({ regionCode, value: null })),
    ],
  };
}

function bundleFixture() {
  return {
    indicators: { students_total: studentsTotalFile() },
    series: {} as Record<string, SeriesFile>,
  };
}

for (const reason of ["webgl", "error"] as const) {
  it(`${reason}: retains located school details and their actions`, async () => {
    const school: School = { id: "test-school", name: "대체화면학교", level: "elem", status: "운영", branch: false,
      lat: 35.82, lng: 127.14, regionCode: "52110", students: 60, classes: 6, teachers: 10, studentsPerClass: 10, small: true };
    const onClose = vi.fn();
    const onStatistics = vi.fn();
    render(<MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()}
      reason={reason} selectedSchool={school} onSchoolClose={onClose} onSchoolStatistics={onStatistics} />);
    const detail = within(screen.getByTestId("fallback-school-detail"));
    expect(detail.getByRole("heading", { name: school.name })).toBeVisible();
    expect(detail.getByText("60명")).toBeVisible();
    await userEvent.click(detail.getByRole("button", { name: "해당 시군 통계 보기" }));
    expect(onStatistics).toHaveBeenCalledWith("52110");
    await userEvent.click(detail.getByRole("button", { name: "학교 선택 해제" }));
    expect(onClose).toHaveBeenCalledOnce();
  });
}

describe("MapFallback", () => {
  it("shows the WebGL-failure reason text", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="webgl" />,
    );
    expect(screen.getByText("이 환경에서는 지도를 표시할 수 없어 표로 보여드립니다")).toBeInTheDocument();
  });

  it("shows the narrow-viewport reason text", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="viewport" />,
    );
    expect(screen.getByText("화면이 좁아 표로 표시합니다")).toBeInTheDocument();
  });

  it("shows an error reason text", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="error" />,
    );
    expect(screen.getByText(/오류/)).toBeInTheDocument();
  });

  it("renders a real <table> with one row per 시군 (14 rows), ranked largest-first", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="webgl" />,
    );
    const rows = screen.getAllByRole("row"); // includes the header row
    expect(rows).toHaveLength(REGIONS.length + 1);
    const dataRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(dataRows[0]).getByText("전주시")).toBeInTheDocument();
    expect(within(dataRows[1]).getByText("군산시")).toBeInTheDocument();
    expect(within(dataRows[2]).getByText("익산시")).toBeInTheDocument();
  });

  it("shows each row's formatted value and rank", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="webgl" />,
    );
    const dataRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    expect(within(dataRows[0]).getByText("70,851")).toBeInTheDocument();
    expect(within(dataRows[0]).getByText("1위")).toBeInTheDocument();
    expect(within(dataRows[1]).getByText("50,000")).toBeInTheDocument();
    expect(within(dataRows[1]).getByText("2위")).toBeInTheDocument();
  });

  it("shows 자료 없음 for a region with a null value, with no rank", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="webgl" />,
    );
    const dataRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const last = dataRows[dataRows.length - 1];
    expect(within(last).getByText("자료 없음")).toBeInTheDocument();
  });

  it("renders a proportional bar whose width reflects each row's normalized value", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="webgl" />,
    );
    const bars = screen.getAllByTestId("fallback-bar-fill");
    // 전주시 is the domain max (count-kind floors at 0) -> a full-width (100%) bar.
    expect(bars[0]).toHaveStyle({ width: "100%" });
    // 익산시 (1,000 of [0, 70851]) is much narrower than 전주시's.
    const widthOf = (el: HTMLElement) => Number(el.style.width.replace("%", ""));
    expect(widthOf(bars[2])).toBeLessThan(widthOf(bars[0]));
    expect(widthOf(bars[2])).toBeGreaterThan(0);
  });

  it("clicking a row calls onSelect with that region's code", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={onSelect} reason="webgl" />);
    await user.click(screen.getByRole("button", { name: /전주시/ }));
    expect(onSelect).toHaveBeenCalledWith("52110");
  });

  // Fix round 1/5, finding 3: the name <button> sits inside its <tr>, which
  // has its own onClick — without stopPropagation a button click bubbles up
  // and fires the row's handler too, calling onSelect twice for one click.
  it("clicking the name button calls onSelect exactly once (review finding 3)", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={onSelect} reason="webgl" />);
    await user.click(screen.getByRole("button", { name: /전주시/ }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("clicking another cell in the row (not the button) calls onSelect exactly once via the row's own handler", async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode={null} onSelect={onSelect} reason="webgl" />);
    const dataRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    // The value cell, not the name button — exercises the <tr>'s own
    // onClick (the mouse-only convenience), not the button's handler.
    await user.click(within(dataRows[0]).getByText("70,851"));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(onSelect).toHaveBeenCalledWith("52110");
  });

  it("marks the currently-selected region's row with aria-current", () => {
    render(
      <MapFallback indicatorId="students_total" bundle={bundleFixture()} selectedCode="52130" onSelect={vi.fn()} reason="webgl" />,
    );
    const dataRows = within(screen.getByRole("table")).getAllByRole("row").slice(1);
    const gunsanRow = dataRows.find((r) => within(r).queryByText("군산시"));
    expect(gunsanRow).toHaveAttribute("aria-current", "true");
  });

  it("throws for an unknown indicatorId (same contract as DeckMap/RegionList)", () => {
    // Swallow the expected console.error React logs for this render failure.
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <MapFallback indicatorId="not-a-real-id" bundle={bundleFixture()} selectedCode={null} onSelect={vi.fn()} reason="webgl" />,
      ),
    ).toThrow();
    spy.mockRestore();
  });
});


it("keeps issue values and region selection available when WebGL is unavailable", async () => {
  const onSelect = vi.fn();
  const model: IssueMapModel = {
    issue: PUBLISHED_ISSUES[0], metric: "designation", title: "인구감소지역 지정",
    date: "공식 자료 확인 2026-09-22", note: "공식 지정 현황입니다.",
    regions: REGIONS.map(({code}) => ({code, value: code === "52140" ? "attention" : null, text: code === "52140" ? "관심지역" : "자료 없음", color: [100, 100, 100, 85]})),
    schools: [], legend: [], provinceText: "관심지역 1곳", sources: [],
  };
  render(<MapFallback indicatorId="students_total" bundle={bundleFixture()} issueModel={model} selectedCode={null} onSelect={onSelect} reason="webgl" />);
  expect(screen.getByRole("heading", {name: "인구감소지역 지정"})).toBeInTheDocument();
  expect(screen.getByText("관심지역")).toBeInTheDocument();
  expect(screen.getAllByRole("row")).toHaveLength(15);
  expect(screen.queryByText("70,851")).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole("button", {name: "익산시"}));
  expect(onSelect).toHaveBeenCalledWith("52140");
});
