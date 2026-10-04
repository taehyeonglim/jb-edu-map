import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import TimeSeriesChart from "@/components/ui/TimeSeriesChart";

describe("TimeSeriesChart", () => {
  it("labels the expanded y-axis and retains full annual values", () => {
    const { container } = render(<TimeSeriesChart place="전북" label="학생수" unit="명" format={value => value.toLocaleString("ko-KR")} data={[{ year: 2025, value: 174003 }, { year: 2026, value: 165958 }]} />);
    expect(screen.getByText("세로축 확대 · 명")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2025 174,003명" })).toBeInTheDocument();
    expect(container.querySelectorAll("svg line").length).toBeGreaterThanOrEqual(4);
    expect(container.querySelector(".truncate")).toBeNull();
  });
  it("compares on one scale and does not claim an annual change across an absent year", async () => {
    const user = userEvent.setup();
    const { container } = render(<TimeSeriesChart place="전주시" label="학생수" unit="명" format={String}
      data={[{ year: 2022, value: 100 }, { year: 2024, value: 80 }]}
      comparison={{ place: "군산시", data: [{ year: 2022, value: 40 }, { year: 2023, value: 40 }, { year: 2024, value: 40 }] }} />);
    expect(screen.getByText("군산시 40명")).toBeInTheDocument();
    expect(screen.queryByText(/전년 대비/)).not.toBeInTheDocument();
    expect(container.querySelectorAll("path")).toHaveLength(1);
    expect(container.querySelector("path")).toHaveAttribute("stroke-dasharray", "5 4");
    await user.click(screen.getByRole("button", { name: /2023/ }));
    expect(screen.getByText("2023년 전주시 자료 없음")).toBeInTheDocument();
  });

  it("does not draw a trend from a single observation", () => {
    const { container } = render(<TimeSeriesChart place="전주시" label="학생수" unit="명" format={String} data={[{ year: 2026, value: 100 }]} />);
    expect(screen.getByText("추이 없음")).toBeInTheDocument();
    expect(container.querySelector("svg")).toBeNull();
  });
  it("shows each annual value and updates the focused year's change", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart
      place="전주시" label="학생수" unit="명" format={(value) => value.toLocaleString("ko-KR")}
      data={[{ year: 2022, value: 100 }, { year: 2023, value: 90 }, { year: 2024, value: 85 }]}
    />);
    const chart = screen.getByRole("region", { name: "전주시 학생수 시계열 추이" });
    expect(chart).toHaveTextContent("2024년 85명");
    expect(chart).toHaveTextContent("전년 대비 −5명");
    await user.click(within(chart).getByRole("button", { name: /2023/ }));
    expect(chart).toHaveTextContent("2023년 90명");
    expect(chart).toHaveTextContent("전년 대비 −10명");
  });

  it("keeps missing years blank and expresses share changes in percentage points", async () => {
    const user = userEvent.setup();
    render(<TimeSeriesChart
      place="전북 전체" label="소규모학교 비율" unit="%" format={(value) => `${value.toFixed(1)}%`}
      data={[{ year: 2022, value: 30 }, { year: 2023, value: null }, { year: 2024, value: 32 }, { year: 2025, value: 33 }]}
    />);
    const chart = screen.getByRole("region", { name: "전북 전체 소규모학교 비율 시계열 추이" });
    expect(within(chart).getByRole("button", { name: /2023/ })).toHaveTextContent("—");
    expect(chart).toHaveTextContent("전년 대비 +1.0%p");
    await user.click(within(chart).getByRole("button", { name: /2023/ }));
    expect(chart).toHaveTextContent("2023년 자료 없음");
  });
});
