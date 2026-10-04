import { describe, expect, it } from "vitest";
import { shareNumerator, schoolDistribution } from "@/lib/analysis";
import type { MapMetricSpec } from "@/lib/mapMetrics";
import type { School } from "@/lib/schools/types";

describe("analysis data", () => {
  it("recovers exact integer share counts but refuses rounded or unavailable inputs", () => {
    expect(shareNumerator(23 / 81 * 100, 81)).toBe(23);
    expect(shareNumerator(28.4, 81)).toBeNull();
    expect(shareNumerator(null, 81)).toBeNull();
    expect(shareNumerator(0, 0)).toBeNull();
    expect(shareNumerator(0, 81)).toBe(0);
    expect(shareNumerator(120, 81)).toBeNull();
  });
  it("uses the map's exact bins without dropping zero, missing or unlocated schools", () => {
    const zero = [1, 1, 1, 255] as [number, number, number, number];
    const missing = [2, 2, 2, 255] as [number, number, number, number];
    const positive = [3, 3, 3, 255] as [number, number, number, number];
    const metric = { kind: "value", legend: [{ label: "0", color: zero }, { label: "자료 없음", color: missing }, { label: "양수", color: positive }], color: (school: School) => school.students === null ? missing : school.students === 0 ? zero : positive } as MapMetricSpec;
    const schools = [{ students: null }, { students: 0 }, { students: 2, lat: null }, { students: 3 }] as School[];
    expect(schoolDistribution(schools, metric).map(bin => bin.value)).toEqual([1, 1, 2]);
    expect(schoolDistribution(schools, { ...metric, kind: "region" })).toEqual([]);
  });
});
