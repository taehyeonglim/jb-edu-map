import { describe, expect, it } from "vitest";
import { issueMetricUnit, issueResources, schoolSizeDistribution, staffCoverage } from "@/lib/issues/analysis";
import type { EducationIssuesFile, IssueResource } from "@/lib/issues/types";
import type { School } from "@/lib/schools/types";
import { SCHOOL_SIZE_COLORS } from "@/lib/mapMetrics";

const school = (id: string, students: number | null) => ({ id, students } as School);

describe("education question analysis populations", () => {
  it("partitions all schools once, including zero, exact boundaries and missing student counts", () => {
    const input = [0, 60, 61, 999, 1000, null].map((students, index) => school(String(index), students));
    const rows = schoolSizeDistribution(input);
    expect(rows.map(row => row.value)).toEqual([2, 2, 1, 1]);
    expect(rows.reduce((sum, row) => sum + row.value, 0)).toBe(input.length);
    expect(rows.slice(0, 3).map(row => row.color)).toEqual(SCHOOL_SIZE_COLORS.map(color => `rgb(${color.slice(0, 3).join(",")})`));
  });

  it("uses the identical main-school denominator and keeps unknown staff counts separate", () => {
    const schools = [school("present", 100), school("zero", 0), school("unknown", 50), school("branch", 20)];
    const data = { schools: {
      present: { isMain: true, librarianTeachers: 2 }, zero: { isMain: true, librarianTeachers: 0 },
      unknown: { isMain: true, librarianTeachers: null }, branch: { isMain: false, librarianTeachers: 1 },
    } } as unknown as EducationIssuesFile;
    expect(staffCoverage(schools, data, "librarianTeachers")).toEqual({ total: 3, present: 1, absent: 1, missing: 1, share: null });
    data.schools.unknown.librarianTeachers = 0;
    expect(staffCoverage(schools, data, "librarianTeachers").share).toBeCloseTo(100 / 3);
    expect(staffCoverage([], data, "librarianTeachers").share).toBeNull();
  });

  it("separates care datasets and does not attribute an unidentified region to a selected city", () => {
    const resources = [
      { issue: "care", name: "pilot", regionCode: "52110" },
      { issue: "care", name: "unidentified", regionCode: null },
      { issue: "care", metric: "care-centers", name: "child center", regionCode: "52130" },
      { issue: "reading", name: "library", regionCode: "52110" },
    ] as IssueResource[];
    const data = { resources } as EducationIssuesFile;
    expect(issueResources(data, "care-pilots", null).map(row => row.name)).toEqual(["pilot", "unidentified"]);
    expect(issueResources(data, "care-pilots", "52110").map(row => row.name)).toEqual(["pilot"]);
    expect(issueResources(data, "care-centers", "52110")).toEqual([]);
    expect(issueResources(data, "care-centers", null).map(row => row.name)).toEqual(["child center"]);
    expect(issueResources(data, "libraries", "52110").map(row => row.name)).toEqual(["library"]);
  });

  it("uses percentage, count and categorical units consistently", () => {
    expect(issueMetricUnit("unused-share")).toBe("%");
    expect(issueMetricUnit("unused-count")).toBe("건");
    expect(issueMetricUnit("librarian-schools")).toBe("개교");
    expect(issueMetricUnit("libraries")).toBe("곳");
    expect(issueMetricUnit("career-regions")).toBe("");
    expect(issueMetricUnit("special-students")).toBe("명");
  });
});
