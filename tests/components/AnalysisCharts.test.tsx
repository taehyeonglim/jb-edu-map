import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BarChart, CompositionChart } from "@/components/ui/AnalysisCharts";

describe("analysis charts", () => {
  it("keeps zero distinct from missing and allows a keyboard region selection", async () => {
    const onSelect = vi.fn();
    render(<BarChart title="시군 비교" unit="개교" onSelect={onSelect} rows={[
      { id: "zero", label: "실측 지역", value: 0 },
      { id: "missing", label: "미수록 지역", value: null },
    ]} />);
    expect(screen.getByRole("button", { name: "실측 지역 0개교" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "미수록 지역 자료 없음" })).toBeInTheDocument();
    const user = userEvent.setup();
    await user.tab();
    await user.keyboard("{Enter}");
    expect(onSelect).toHaveBeenCalledWith("zero");
  });

  it("draws signed values around the same zero with a correctly positioned reference", () => {
    const { container } = render(<BarChart title="증감률" unit="%" reference={{ value: 0, label: "기준" }} rows={[
      { id: "a", label: "감소", value: -20 }, { id: "b", label: "증가", value: 10 },
    ]} />);
    const marks = container.querySelectorAll<HTMLElement>(".analysis-bar-row span[style]");
    expect([...marks].filter(mark => mark.style.left.startsWith("66.666")).length).toBeGreaterThan(0);
    expect([...marks].some(mark => mark.style.width.startsWith("66.666"))).toBe(true);
    expect([...marks].some(mark => mark.style.width.startsWith("33.333"))).toBe(true);
  });

  it("includes missing records in composition and does not invent percentages for an empty population", () => {
    render(<CompositionChart title="학교 분포" segments={[
      { id: "small", label: "작은학교", value: 2, color: "cyan" },
      { id: "missing", label: "자료 없음", value: 1, color: "gray" },
    ]} />);
    expect(screen.getByRole("img")).toHaveAccessibleName("작은학교 2, 66.7% · 자료 없음 1, 33.3%");
    render(<CompositionChart title="빈 결과" segments={[{ id: "a", label: "학교", value: 0, color: "cyan" }]} />);
    expect(within(screen.getByRole("region", { name: "빈 결과" })).queryByRole("img")).toBeNull();
    expect(screen.queryByText(/NaN|Infinity/)).toBeNull();
  });
});
