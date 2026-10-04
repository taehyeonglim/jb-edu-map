import { beforeAll, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import IssueAnalysis from "@/components/panels/IssueAnalysis";
import { loadBundle } from "@/lib/data/load";
import type { DataBundle } from "@/lib/data/types";
import type { EducationIssuesFile } from "@/lib/issues/types";
import { buildIssueModel } from "@/lib/issues/model";
import { issueById } from "@/lib/issues/registry";

let bundle: DataBundle;
let data: EducationIssuesFile;
beforeAll(async () => {
  bundle = await loadBundle(async url => new Response(readFileSync(`public${url}`, "utf8")));
  data = JSON.parse(readFileSync("public/data/education-issues.json", "utf8"));
});
const model = (id: string, metric: string | null = null) => buildIssueModel(bundle, data, issueById(id)!, metric);

describe("question-specific visible evidence", () => {
  it.each([
    ["school-size", "학교 규모 핵심 비교"],
    ["regional-sustainability", "학생 변화와 작은학교 핵심 비교"],
    ["special-education", "특수교육 핵심 비교"],
    ["closed-assets", "폐교 활용 핵심 비교"],
    ["basic-learning", "지역별 제공 현황"],
    ["reading", "기관과 교사 배치 핵심 비교"],
    ["care", "돌봄 자료 수록 범위"],
    ["wellbeing", "기관과 교사 배치 핵심 비교"],
    ["career", "지역별 제공 현황"],
    ["ai-education", "AI 중점학교 핵심 비교"],
  ])("shows an explicit answer for %s before its detailed lists", (id, name) => {
    render(<IssueAnalysis bundle={bundle} data={data} model={model(id)} region={null} compare={null} onMetric={vi.fn()} />);
    expect(screen.getByRole("region", { name })).toBeInTheDocument();
  });

  it("compares two school-size distributions without treating school count as school size", () => {
    render(<IssueAnalysis bundle={bundle} data={data} model={model("school-size")} region="52110" compare="52130" onMetric={vi.fn()} />);
    const jeonju = screen.getByRole("region", { name: "전주시 학교 규모별 분포" });
    expect(within(jeonju).getByRole("img")).toHaveAccessibleName(/1,000명 이상 6,/);
    expect(screen.getByRole("region", { name: "군산시 학교 규모별 분포" })).toBeInTheDocument();
    expect(jeonju).toHaveTextContent("분교 제외");
  });

  it("switches special education from school types to two regions on the existing series", async () => {
    const user = userEvent.setup();
    const onMetric = vi.fn();
    const { container } = render(<IssueAnalysis bundle={bundle} data={data} model={model("special-education", "special-classes")} region="52110" compare="52130" onMetric={onMetric} />);
    expect(screen.getByText("┄ 전주시 특수학교")).toBeInTheDocument();
    expect(container.querySelectorAll("path")).toHaveLength(2);
    await user.click(screen.getByRole("button", { name: "두 지역 비교" }));
    expect(screen.getByText("┄ 군산시 일반학교")).toBeInTheDocument();
    expect(screen.queryByText("┄ 전주시 특수학교")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "학생수 추이" }));
    expect(onMetric).toHaveBeenCalledWith("special-students");
  });

  it("keeps an unregistered care region missing and avoids a fabricated capacity chart", () => {
    render(<IssueAnalysis bundle={bundle} data={data} model={model("care", "care-centers")} region="52110" compare={null} onMetric={vi.fn()} />);
    expect(screen.getByText("지역아동센터 자료 7/14개 시군 수록")).toBeInTheDocument();
    expect(screen.getByText(/전주시 · 원자료 미등록/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "전주시 수록 기관" })).toHaveTextContent("자료 없음");
    expect(screen.queryByRole("region", { name: "기관별 돌봄 정원과 현원" })).not.toBeInTheDocument();
  });

  it("shows a care institution's dated capacity and enrollment, preserving missing values", () => {
    const custom = structuredClone(data);
    custom.resources = [{ issue: "care", metric: "care-centers", name: "테스트센터", regionCode: "52130", address: null, phone: null, schoolId: null, detail: null, capacity: 40, enrolled: null, referenceDate: "2025-12-01" }];
    render(<IssueAnalysis bundle={bundle} data={custom} model={buildIssueModel(bundle, custom, issueById("care")!, "care-centers")} region="52130" compare={null} onMetric={vi.fn()} />);
    const chart = screen.getByRole("region", { name: "테스트센터" });
    expect(chart).toHaveTextContent("40명");
    expect(chart).toHaveTextContent("현원자료 없음");
    expect(chart).toHaveTextContent("2025-12-01");
    expect(chart).toHaveTextContent("실시간 이용 가능 자리가 아닙니다");
  });

  it.each(["basic-learning", "career"])("presents uniform provision instead of a numeric ranking for %s", id => {
    const { container } = render(<IssueAnalysis bundle={bundle} data={data} model={model(id)} region={null} compare={null} onMetric={vi.fn()} />);
    expect(screen.getByText("14 / 14")).toBeInTheDocument();
    expect(screen.getByText(/모든 시군이 같은 제공 현황/)).toBeInTheDocument();
    expect(screen.getByRole("link")).toHaveAttribute("href", data.resourceSources![id].url);
    expect(container.querySelector(".analysis-bar-row")).toBeNull();
  });
});
