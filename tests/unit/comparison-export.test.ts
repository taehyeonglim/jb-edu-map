import { readFileSync } from "node:fs";
import { beforeAll, describe, expect, it } from "vitest";
import { loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import {
  buildIndicatorComparison,
  buildIssueComparison,
} from "@/lib/comparison";
import { comparisonCsv, schoolCsv, toCsv } from "@/lib/export";
import { alignSeries, seriesSegments } from "@/lib/timeSeries";
import { buildIssueModel } from "@/lib/issues/model";
import { PUBLISHED_ISSUES } from "@/lib/issues/registry";
import type { EducationIssuesFile } from "@/lib/issues/types";
import { parseCsv } from "../../scripts/pipeline/lib/csv";

let bundle: DataBundle;
let facts: EducationIssuesFile;
beforeAll(async () => {
  bundle = await loadBundle(
    async (url) => new Response(readFileSync(`public${url}`, "utf8")),
  );
  facts = JSON.parse(readFileSync("public/data/education-issues.json", "utf8"));
});

describe("comparison and export contracts", () => {
  it("compares all 18 latest indicators with signed differences and row-specific dates", () => {
    const rows = buildIndicatorComparison(bundle, "52110", "52130");
    expect(rows).toHaveLength(18);
    for (const row of rows) {
      expect(row.referenceDate).toBe(bundle.indicators[row.id].referenceDate);
      expect(row.sourceUrl).toBe(bundle.indicators[row.id].source.url);
      expect(row.texts.join(" ")).not.toMatch(/%%|㎡㎡/);
      if (
        typeof row.values[0] === "number" &&
        typeof row.values[1] === "number"
      )
        expect(row.difference).toBe(row.values[0] - row.values[1]);
      if (row.unit === "%") expect(row.differenceText).toMatch(/%p$/);
    }
  });

  it("preserves zero, null, and province aggregates without inventing differences", () => {
    const copy = structuredClone(bundle);
    const file = copy.indicators.students_total;
    file.rows.find((row) => row.regionCode === "52110" && !row.level)!.value =
      0;
    file.rows.find((row) => row.regionCode === "52130" && !row.level)!.value =
      null;
    const before = JSON.stringify(copy);
    const row = buildIndicatorComparison(copy, "52110", "52130").find(
      (row) => row.id === "students_total",
    )!;
    expect(row.values).toEqual([0, null]);
    expect(row.texts).toEqual(["0명", "자료 없음"]);
    expect(row.difference).toBeNull();
    expect(JSON.stringify(copy)).toBe(before);
    const csv = comparisonCsv([row], "52110", "52130", "시군 전체 집계");
    expect(csv).toContain('0,"0명","값 있음"');
    expect(csv).toContain(',"군산시",,"자료 없음","자료 없음"');
  });

  it("uses the correct source for each issue metric and never subtracts designations", () => {
    for (const issue of PUBLISHED_ISSUES) {
      const model = buildIssueModel(bundle, facts, issue, issue.metrics[0]);
      const rows = buildIssueComparison(bundle, facts, model, "52110", "52130");
      expect(rows).toHaveLength(issue.metrics.length);
      for (const row of rows) {
        expect(row.referenceDate).toBe(
          buildIssueModel(bundle, facts, issue, row.id).date,
        );
        expect(row.source).not.toBe("");
        if (["designation", "career-regions"].includes(row.id)) {
          expect(row.difference).toBeNull();
          expect(row.differenceText).toBe("비교 불가");
        }
      }
    }
  });

  it("exports every filtered school, including those without coordinates, with provenance", () => {
    const schools = bundle.schools.schools
      .slice(0, 70)
      .map((school, index) =>
        index
          ? school
          : {
              ...school,
              name: '테스트,"학교"\n분교',
              lat: null,
              lng: null,
              students: null,
            },
      );
    const csv = schoolCsv(
      schools,
      bundle.schools,
      { name: "학교", level: "all", regionCode: null },
      "학생 분포",
    );
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain('"테스트,""학교""\n분교"');
    expect(csv).toContain('"학생수 자료 없음"');
    expect(csv).toContain('"위치 없음"');
    expect(csv).toContain(bundle.schools.source.stats.url);
    expect(csv).toContain("검색어=학교; 학교급=all");
    for (const school of schools) expect(csv).toContain(`"${school.id}"`);
  });

  it("neutralizes formula-like text but keeps real negative numbers numeric", () => {
    expect(
      toCsv([["=1+1", " +cmd", "@A1", "-10", "\tformula", -10, 0, null]]),
    ).toBe('\uFEFF"\'=1+1","\' +cmd","\'@A1","\'-10","\'\tformula",-10,0,\r\n');
  });

  it("exports the displayed school metric and does not assign regional values to schools", () => {
    const schools = bundle.schools.schools.slice(0, 1);
    const filters = { name: "", level: "all" as const, regionCode: null };
    const metric = {
      kind: "value" as const,
      title: "일반학교 특수교육 학생수",
      unit: "명",
      date: "기준 2026-04-01",
      value: () => 7,
    };
    const rows = parseCsv(
      schoolCsv(schools, bundle.schools, filters, "특수교육", metric),
    );
    expect(rows[1][rows[0].indexOf("선택지표표시값")]).toBe("7명");
    const regional = parseCsv(
      schoolCsv(schools, bundle.schools, filters, "지역 통계", {
        ...metric,
        kind: "region",
      }),
    );
    expect(regional[1][regional[0].indexOf("선택지표값")]).toBe("");
    expect(regional[1][regional[0].indexOf("선택지표표시값")]).toBe(
      "시군 집계 지표",
    );
  });
});

it("aligns both regions on calendar years and splits absent/null years", () => {
  const { rows, other } = alignSeries(
    [
      { year: 2022, value: 10 },
      { year: 2024, value: 0 },
      { year: 2025, value: 5 },
    ],
    [
      { year: 2023, value: 40 },
      { year: 2025, value: null },
    ],
  );
  expect(rows.map((row) => row.value)).toEqual([10, null, 0, 5]);
  expect(other.map((row) => row.value)).toEqual([null, 40, null, null]);
  expect(seriesSegments(rows).map((segment) => segment.length)).toEqual([1, 2]);
  expect(alignSeries([])).toEqual({ rows: [], other: [] });
});
