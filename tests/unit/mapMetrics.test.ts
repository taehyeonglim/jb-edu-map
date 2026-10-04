import { beforeAll, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile } from "@/lib/issues/types";
import { buildMapMetric, MISSING_COLOR, ZERO_COLOR, SPECIAL_RAMP, SCHOOL_SIZE_COLORS, metricRadius, metricReferenceValues, metricSchoolLabel, metricSchoolLabelCharset } from "@/lib/mapMetrics";
import { INDICATORS } from "@/lib/indicators/registry";
import { PUBLISHED_ISSUES } from "@/lib/issues/registry";
import { buildIssueModel } from "@/lib/issues/model";
import {
  makeDensityLayer,
  supportsDensity,
} from "@/components/map/layers/metricLayers";
import { hasCoordinates } from "@/components/map/layers/schoolLayers";
import type { Device } from "@luma.gl/core";

let bundle: DataBundle;
let facts: EducationIssuesFile;
beforeAll(async () => {
  bundle = await loadBundle(
    async (url) => new Response(readFileSync(`public${url}`, "utf8")),
  );
  facts = JSON.parse(readFileSync("public/data/education-issues.json", "utf8"));
});

describe("education city metrics", () => {
  it("prints percent and area units exactly once in province summaries", () => {
    for (const [id, expected] of [
      ["students_change_5y", "전북 전체 -12.5%"],
      ["small_school_share", "전북 전체 41.3%"],
      ["rural_school_share", "전북 전체 43.4%"],
      ["site_area_per_student", "전북 전체 85㎡"],
      ["students_total", "전북 전체 165,958명"],
    ]) expect(buildMapMetric(bundle, id, null, facts).summary).toBe(expected);
  });
  const density = ["students_total", "classes_total", "teachers_total"];
  const category = ["schools_total", "small_schools", "zero_entrant_schools"];
  const value = [
    "students_per_class",
    "students_per_teacher",
    "special_classes",
    "special_students",
  ];
  const region = [
    "site_area_per_student",
    "classrooms_per_school",
    "small_school_share",
    "rural_school_share",
    "students_change_5y",
    "closed_schools",
    "closed_schools_unused",
    "closed_schools_recent",
  ];
  it("assigns every indicator an explicit representation", () => {
    expect([...density, ...category, ...value, ...region].sort()).toEqual(
      INDICATORS.map((d) => d.id).sort(),
    );
    for (const [kind, ids] of Object.entries({
      density,
      category,
      value,
      region,
    })) {
      for (const id of ids)
        expect(buildMapMetric(bundle, id, null, facts).kind).toBe(kind);
    }
  });
  it("covers every published issue without projecting regional rates onto schools", () => {
    for (const issue of PUBLISHED_ISSUES)
      for (const id of issue.metrics) {
        const source = buildIssueModel(bundle, facts, issue, id);
        const model = buildMapMetric(bundle, "students_total", source, facts);
        expect(model.title).toBe(source.title);
        expect(model.summary).toBe(source.provinceText);
        if (["designation", "student-change", "small-share"].includes(id)) {
          expect(model.kind).toBe("region");
          expect(
            bundle.schools.schools.every((s) => model.value(s) === null),
          ).toBe(true);
        }
      }
  });
  it("keeps all-school and general-school special education totals distinct", () => {
    const issue = PUBLISHED_ISSUES.find((d) => d.id === "special-education")!;
    for (const [indicator, metric, all, regular] of [
      ["special_classes", "special-classes", 800, 559],
      ["special_students", "special-students", 3804, 2483],
    ] as const) {
      const total = buildMapMetric(bundle, indicator, null, facts);
      const general = buildMapMetric(
        bundle,
        indicator,
        buildIssueModel(bundle, facts, issue, metric),
        facts,
      );
      const sum = (model: typeof total) =>
        bundle.schools.schools.reduce((n, s) => n + (model.value(s) ?? 0), 0);
      expect(sum(total)).toBe(all);
      expect(sum(general)).toBe(regular);
      expect(total.title).toContain("특수학교 포함");
      expect(general.legend.some((item) => item.label === "자료 없음")).toBe(
        false,
      );
    }
  });
  it("separates zero, missing and a zero denominator", () => {
    const model = buildMapMetric(bundle, "students_per_class", null, facts);
    const sample = bundle.schools.schools[0];
    expect(model.color({ ...sample, students: 0, classes: 1 })).toEqual(
      ZERO_COLOR,
    );
    expect(model.color({ ...sample, students: null })).toEqual(MISSING_COLOR);
    expect(model.color({ ...sample, classes: 0 })).toEqual(MISSING_COLOR);
    expect(model.legend.some((item) => item.label === "자료 없음")).toBe(true);
    expect(model.legend[0].label).toMatch(/^0 초과–/);
    expect(model.legend.some((item) => item.label === "0")).toBe(true);
  });
  it("excludes branches from school counts and preserves the 60-student boundary", () => {
    const model = buildMapMetric(bundle, "small_schools", null, facts);
    const rows = bundle.schools.schools;
    expect(rows.reduce((sum, s) => sum + (model.value(s) ?? 0), 0)).toBe(310);
    expect(
      model.value({ ...rows[0], branch: true, small: true, students: 60 }),
    ).toBe(0);
  });
  it("shares fixed scales across filtered heatmaps and refuses low-precision devices", () => {
    const model = buildMapMetric(bundle, "students_total", null, facts);
    const schools = bundle.schools.schools.filter(hasCoordinates);
    const all = makeDensityLayer(schools, model, false);
    const one = makeDensityLayer(schools.slice(0, 1), model, true);
    expect(all.props.colorDomain).toEqual(one.props.colorDomain);
    expect(model.maximum).toBe(1607);
    expect(supportsDensity({ features: new Set() } as unknown as Device)).toBe(
      false,
    );
    expect(
      supportsDensity({
        features: new Set([
          "float32-renderable-webgl",
          "texture-blend-float-webgl",
        ]),
      } as unknown as Device),
    ).toBe(true);
  });
  it("renders missing regional data distinctly and uses a zero-centered change scale", () => {
    const model = buildMapMetric(bundle, "students_change_5y", null, facts);
    expect(model.kind).toBe("region");
    expect(model.legend[1].label).toBe("0%");
    expect(model.regionColor("unknown")).toEqual(MISSING_COLOR);
    expect(model.legend[0].color).not.toEqual(model.legend[2].color);
  });
  it("distinguishes special education values with fixed inclusive integer bins", () => {
    const sample = bundle.schools.schools[0];
    for (const [id, field, values] of [
      ["special_classes", "specialClasses", [1, 2, 3, 4, 10, 11, 33]],
      ["special_students", "specialStudents", [1, 5, 6, 10, 11, 20, 21, 50, 51, 206]],
    ] as const) {
      const expected = field === "specialClasses" ? [0, 1, 2, 3, 3, 4, 4] : [0, 0, 1, 1, 2, 2, 3, 3, 4, 4];
      values.forEach((value, index) => {
        const changed = { ...facts, schools: { ...facts.schools, [sample.id]: { ...facts.schools[sample.id], [field]: value } } };
        expect(buildMapMetric(bundle, id, null, changed).color(sample)).toEqual(SPECIAL_RAMP[expected[index]]);
      });
      for (const value of [0, null]) {
        const changed = { ...facts, schools: { ...facts.schools, [sample.id]: { ...facts.schools[sample.id], [field]: value } } };
        expect(buildMapMetric(bundle, id, null, changed).color(sample)).toEqual(value === 0 ? ZERO_COLOR : MISSING_COLOR);
      }
    }
    expect(buildMapMetric(bundle, "special_classes", null, facts).legend.map((item) => item.label)).toEqual(["1학급", "2학급", "3학급", "4–10학급", "11학급 이상", "0"]);
    expect(buildMapMetric(bundle, "special_students", null, facts).legend.map((item) => item.label)).toEqual(["1–5명", "6–10명", "11–20명", "21–50명", "51명 이상", "0"]);
  });
  it("shares school-size colors between rendered schools and legend", () => {
    const issue = PUBLISHED_ISSUES.find((item) => item.metrics.includes("school-size"))!;
    const model = buildMapMetric(bundle, "students_total", buildIssueModel(bundle, facts, issue, "school-size"), facts);
    [60, 61, 1000].forEach((students, index) => {
      expect(model.color({ ...bundle.schools.schools[0], students })).toEqual(SCHOOL_SIZE_COLORS[index]);
      expect(model.legend[index].color).toEqual(SCHOOL_SIZE_COLORS[index]);
    });
  });
  it("labels integer regional buckets without fractional or empty count ranges", () => {
    for (const id of ["closed_schools", "closed_schools_unused", "closed_schools_recent"]) {
      const model = buildMapMetric(bundle, id, null, facts);
      for (const item of model.legend) {
        const ends = item.label.replace("교", "").split("–").map(Number);
        expect(ends.every(Number.isInteger)).toBe(true);
        expect(ends[0]).toBeLessThanOrEqual(ends[1] ?? ends[0]);
      }
      for (const row of bundle.indicators[id].rows.filter((row) => row.regionCode !== "52000")) {
        const matches = model.legend.filter((item) => {
          const [low, high = low] = item.label.replace("교", "").split("–").map(Number);
          return row.value !== null && row.value >= low && row.value <= high;
        });
        expect(matches).toHaveLength(1);
        expect(matches[0].color).toEqual(model.regionColor(row.regionCode));
      }
    }
  });
  it("uses current school metric labels and shared size samples", () => {
    const sample = bundle.schools.schools[0];
    expect(metricSchoolLabel(buildMapMetric(bundle, "teachers_total", null, facts), sample)).toBe(`${sample.name}\n교원수 ${sample.teachers}명`);
    expect(metricSchoolLabel(buildMapMetric(bundle, "site_area_per_student", null, facts), sample)).toBe(sample.name);
    expect(metricSchoolLabel(buildMapMetric(bundle, "small_schools", null, facts), sample)).toContain("해당 없음");
    expect(metricReferenceValues(100)).toEqual([25, 50, 100]);
    expect(metricReferenceValues(0)).toEqual([]);
    expect(metricRadius(25, 100)).toBe(9);
    expect(metricRadius(100, 100)).toBe(18);
    expect(metricRadius(0, 100)).toBe(5);
    expect(metricRadius(null, 100)).toBe(5);
  });

  it("labels decline overlays with school students and includes runtime glyphs", () => {
    const issue = PUBLISHED_ISSUES.find((item) => item.metrics.includes("decline-small"))!;
    const model = buildMapMetric(bundle, "students_total", buildIssueModel(bundle, facts, issue, "decline-small"), facts);
    const sample = { ...bundle.schools.schools[0], students: 32 };
    expect(model.title).toContain("증감률");
    expect(metricSchoolLabel(model, sample)).toBe(`${sample.name}\n작은학교 학생수 32명`);
    const charset = metricSchoolLabelCharset(model);
    expect(metricSchoolLabelCharset(buildMapMetric(bundle, "students_total", null, facts))).toContain("작");
    for (const char of "작은학교 학생수32명자료 없음해당") expect(charset).toContain(char);
    for (const indicator of INDICATORS) {
      const metric = buildMapMetric(bundle, indicator.id, null, facts);
      for (const char of `${metric.title}${metric.unit}`) expect(metricSchoolLabelCharset(metric)).toContain(char);
    }
  });

});
