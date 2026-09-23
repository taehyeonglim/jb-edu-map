import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import KpiTiles from "@/components/panels/KpiTiles";
import { formatInt } from "@/lib/format";
import { PROVINCE_CODE } from "@/lib/geo/regions";
import type { IndicatorFile, Manifest, SeriesFile } from "@/lib/indicators/types";

function indicatorFile(id: string, latestValue: number): IndicatorFile {
  return {
    id,
    year: 2026,
    referenceDate: "2026-04-01",
    source: { name: "KESS 테스트", url: "https://example.com", year: 2026 },
    rows: [{ regionCode: PROVINCE_CODE, value: latestValue }],
  };
}

function seriesFile(id: string, values: { year: number; value: number }[]): SeriesFile {
  return {
    id,
    rows: values.map(({ year, value }) => ({ regionCode: PROVINCE_CODE, year, value })),
  };
}

function manifestFixture(): Manifest {
  return { latestYear: 2026, indicators: {}, builtAt: "2026-01-01T00:00:00.000Z", sources: [] };
}

/**
 * Fixture data deliberately covers every case the task brief calls out:
 * - schools_total: increase, neutral polarity -> "▲" in the NEUTRAL tone.
 * - students_total: decrease -> "▼", also neutral tone.
 * - teachers_total: only one year of series data -> no previous year -> "—".
 * - small_schools: increase, polarity higherWorse -> "▲" in the WARNING
 *   tone (the one case the brief calls out by name: 증가가 나쁜 지표).
 *
 * Task 1 fix round 1 (spec §1 ruling): the delta's visible COLOR follows the
 * same polarity rule as data-tone — good change (higherBetter ▲ / higherWorse
 * ▼) = text-positive-text, bad change = text-accent-text, no change or a
 * neutral-polarity indicator = text-ink-muted. The class assertions below
 * use a whole-token regex, never toContain: "text-accent-text" contains
 * "text-accent" as a substring, so a substring check can't tell them apart.
 */
function fixture() {
  return {
    indicators: {
      schools_total: indicatorFile("schools_total", 760),
      students_total: indicatorFile("students_total", 165958),
      teachers_total: indicatorFile("teachers_total", 12500),
      small_schools: indicatorFile("small_schools", 320),
    },
    series: {
      schools_total: seriesFile("schools_total", [
        { year: 2025, value: 751 },
        { year: 2026, value: 760 },
      ]),
      students_total: seriesFile("students_total", [
        { year: 2025, value: 168000 },
        { year: 2026, value: 165958 },
      ]),
      teachers_total: seriesFile("teachers_total", [{ year: 2026, value: 12500 }]),
      small_schools: seriesFile("small_schools", [
        { year: 2025, value: 310 },
        { year: 2026, value: 320 },
      ]),
    },
    manifest: manifestFixture(),
  };
}

/**
 * Same shape as fixture(), except schools_total's 52000 value is unchanged
 * year over year (751 -> 751) — an exact-zero delta, distinct from
 * teachers_total's null (no prior year at all) case above.
 */
/**
 * Same shape as fixture(), except small_schools DEcreases year over year
 * (330 -> 320): a good change on a higherWorse indicator, so its ▼ must wear
 * the positive (teal) text token — the mirror image of fixture()'s warn case.
 */
function fixtureWithSmallSchoolsDecrease() {
  const base = fixture();
  return {
    ...base,
    series: {
      ...base.series,
      small_schools: seriesFile("small_schools", [
        { year: 2025, value: 330 },
        { year: 2026, value: 320 },
      ]),
    },
  };
}

function fixtureWithZeroDelta() {
  const base = fixture();
  return {
    ...base,
    indicators: {
      ...base.indicators,
      schools_total: indicatorFile("schools_total", 751),
    },
    series: {
      ...base.series,
      schools_total: seriesFile("schools_total", [
        { year: 2025, value: 751 },
        { year: 2026, value: 751 },
      ]),
    },
  };
}

describe("KpiTiles", () => {
  it("renders all 4 fixed KPI tiles with their labels", () => {
    render(<KpiTiles {...fixture()} />);
    expect(screen.getByText("학교수")).toBeInTheDocument();
    expect(screen.getByText("학생수")).toBeInTheDocument();
    expect(screen.getByText("교원수")).toBeInTheDocument();
    expect(screen.getByText("소규모학교 수")).toBeInTheDocument();
  });

  it("renders each tile's 52000 (전북 전체) value formatted via the indicator's format()", () => {
    render(<KpiTiles {...fixture()} />);
    expect(screen.getByTestId("kpi-value-schools_total")).toHaveTextContent(formatInt(760));
    expect(screen.getByTestId("kpi-value-students_total")).toHaveTextContent(formatInt(165958));
    expect(screen.getByTestId("kpi-value-teachers_total")).toHaveTextContent(formatInt(12500));
    expect(screen.getByTestId("kpi-value-small_schools")).toHaveTextContent(formatInt(320));
  });

  it("shows an increase (▲) in a neutral tone for a neutral-polarity indicator", () => {
    render(<KpiTiles {...fixture()} />);
    const delta = screen.getByTestId("kpi-delta-schools_total");
    expect(delta).toHaveTextContent(`▲ ${formatInt(9)}`);
    expect(delta).toHaveAttribute("data-tone", "neutral");
  });

  it("shows a decrease (▼) for students_total", () => {
    render(<KpiTiles {...fixture()} />);
    const delta = screen.getByTestId("kpi-delta-students_total");
    expect(delta).toHaveTextContent(`▼ ${formatInt(2042)}`);
    expect(delta).toHaveAttribute("data-tone", "neutral");
  });

  it("shows — when there is no previous year to compare against (데이터 없음)", () => {
    render(<KpiTiles {...fixture()} />);
    const delta = screen.getByTestId("kpi-delta-teachers_total");
    expect(delta).toHaveTextContent("—");
  });

  it("shows an increase (▲) in a WARNING tone for a higherWorse-polarity indicator (small_schools)", () => {
    render(<KpiTiles {...fixture()} />);
    const delta = screen.getByTestId("kpi-delta-small_schools");
    expect(delta).toHaveTextContent(`▲ ${formatInt(10)}`);
    expect(delta).toHaveAttribute("data-tone", "warn");
  });

  it("gives each tile a '{prevYear} → {latestYear}' tooltip derived from the series data", () => {
    render(<KpiTiles {...fixture()} />);
    expect(screen.getByTestId("kpi-tile-schools_total")).toHaveAttribute("title", "2025 → 2026");
    expect(screen.getByTestId("kpi-tile-small_schools")).toHaveAttribute("title", "2025 → 2026");
  });

  it("omits the tooltip when there is no previous year to compare against", () => {
    render(<KpiTiles {...fixture()} />);
    expect(screen.getByTestId("kpi-tile-teachers_total")).not.toHaveAttribute("title");
  });

  it("shows ±0 (distinct from — for no-data) with a '전년과 동일' title when the delta is exactly zero", () => {
    render(<KpiTiles {...fixtureWithZeroDelta()} />);
    const delta = screen.getByTestId("kpi-delta-schools_total");
    expect(delta).toHaveTextContent("±0");
    expect(delta).not.toHaveTextContent("—");
    expect(delta).toHaveAttribute("data-tone", "neutral");
    expect(delta).toHaveAttribute("title", "전년과 동일");
  });

  describe("delta color follows indicator polarity, not sign (Task 1 fix round 1, spec §1)", () => {
    const hasToken = (token: string) => new RegExp(`(^|\\s)${token}(\\s|$)`);

    it("small_schools (higherWorse) increase is a bad change -> text-warning-text", () => {
      render(<KpiTiles {...fixture()} />);
      const delta = screen.getByTestId("kpi-delta-small_schools");
      expect(delta.className).toMatch(hasToken("text-warning-text"));
      expect(delta.className).not.toMatch(hasToken("text-positive-text"));
      expect(delta.className).not.toMatch(hasToken("text-ink-muted"));
    });

    it("small_schools (higherWorse) decrease is a good change -> text-positive-text", () => {
      render(<KpiTiles {...fixtureWithSmallSchoolsDecrease()} />);
      const delta = screen.getByTestId("kpi-delta-small_schools");
      expect(delta).toHaveTextContent(`▼ ${formatInt(10)}`);
      expect(delta.className).toMatch(hasToken("text-positive-text"));
      expect(delta.className).not.toMatch(hasToken("text-accent-text"));
    });

    it("students_total (neutral polarity) decrease stays text-ink-muted — no good/bad reading", () => {
      render(<KpiTiles {...fixture()} />);
      const delta = screen.getByTestId("kpi-delta-students_total");
      expect(delta.className).toMatch(hasToken("text-ink-muted"));
      expect(delta.className).not.toMatch(hasToken("text-accent-text"));
      expect(delta.className).not.toMatch(hasToken("text-positive-text"));
    });

    it("an exact-zero delta is text-ink-muted regardless of polarity", () => {
      render(<KpiTiles {...fixtureWithZeroDelta()} />);
      const delta = screen.getByTestId("kpi-delta-schools_total");
      expect(delta.className).toMatch(hasToken("text-ink-muted"));
    });
  });
});
