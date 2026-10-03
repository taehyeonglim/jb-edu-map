import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";

import { useMapQuery } from "@/lib/state/urlState";

const A = "52110"; // 전주시
const B = "52130"; // 군산시

/**
 * useMapQuery() itself has no DOM to render. A tiny harness component
 * exercises setRegion's history-mode branching (fix round 1, review finding
 * #2) the same way every other hook-consuming test in this suite does
 * (RegionList.test.tsx, RegionPanel.test.tsx): via user.click + the nuqs
 * testing adapter's onUrlUpdate — not a bare renderHook() (not otherwise
 * used anywhere in this codebase, and driving setQuery from outside a real
 * event handler needs careful manual act()/timing that user.click already
 * handles for free).
 */
function Harness() {
  const { regionCode, setRegion } = useMapQuery();
  return (
    <div>
      <span data-testid="region-code">{regionCode ?? "none"}</span>
      <button type="button" onClick={() => setRegion(A)}>
        select-a
      </button>
      <button type="button" onClick={() => setRegion(B)}>
        select-b
      </button>
      <button type="button" onClick={() => setRegion(null)}>
        deselect
      </button>
    </div>
  );
}

function lastHistory(onUrlUpdate: ReturnType<typeof vi.fn>): unknown {
  return onUrlUpdate.mock.calls.at(-1)?.[0]?.options?.history;
}

describe("useMapQuery().setRegion history mode (fix round 1, review finding #2)", () => {
  it("null -> code pushes a new history entry", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<Harness />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });

    await user.click(screen.getByText("select-a"));

    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("region")).toBe(A);
    expect(lastHistory(onUrlUpdate)).toBe("push");
  });

  it("code -> a different code REPLACES the history entry (covers arrow-key cycling, a canvas click on another region, etc. — all funnel through this same setRegion call)", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<Harness />, {
      wrapper: withNuqsTestingAdapter({ searchParams: `?region=${A}`, onUrlUpdate, hasMemory: true }),
    });

    await user.click(screen.getByText("select-b"));

    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("region")).toBe(B);
    expect(lastHistory(onUrlUpdate)).toBe("replace");
  });

  it("code -> null pushes a new history entry (so Back restores the last selection)", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<Harness />, {
      wrapper: withNuqsTestingAdapter({ searchParams: `?region=${A}`, onUrlUpdate, hasMemory: true }),
    });

    await user.click(screen.getByText("deselect"));

    expect(onUrlUpdate.mock.calls.at(-1)?.[0].searchParams.get("region")).toBeNull();
    expect(lastHistory(onUrlUpdate)).toBe("push");
  });

  it("a full cycle (null -> A -> B -> null) uses push, replace, push in order", async () => {
    const user = userEvent.setup();
    const onUrlUpdate = vi.fn();
    render(<Harness />, { wrapper: withNuqsTestingAdapter({ onUrlUpdate, hasMemory: true }) });

    await user.click(screen.getByText("select-a"));
    await user.click(screen.getByText("select-b"));
    await user.click(screen.getByText("deselect"));

    const histories = onUrlUpdate.mock.calls.map((call) => call[0].options.history);
    expect(histories).toEqual(["push", "replace", "push"]);
  });
});

function MetricHarness() {
  const query = useMapQuery();
  return <>
    <span data-testid="active-issue">{query.issueId}:{query.issueMetric}</span>
    <span data-testid="filters">{query.search}:{query.schoolLevel}:{query.compareRegion}</span>
    <button onClick={() => query.setView("statistics")}>statistics</button>
    <button onClick={() => query.setIndicator("teachers_total")}>teachers</button>
    <button onClick={() => query.setIssue("special-education", "special-students")}>special-students</button>
  </>;
}

it("panel changes preserve the selected issue; selecting an indicator clears it atomically", async () => {
  const user = userEvent.setup();
  const onUrlUpdate = vi.fn();
  render(<MetricHarness />, {wrapper:withNuqsTestingAdapter({searchParams:"?issue=special-education&issueMetric=special-classes&view=issues",onUrlUpdate,hasMemory:true})});
  await user.click(screen.getByText("statistics"));
  expect(screen.getByTestId("active-issue")).toHaveTextContent("special-education:special-classes");
  await user.click(screen.getByText("special-students"));
  expect(screen.getByTestId("active-issue")).toHaveTextContent("special-education:special-students");
  await user.click(screen.getByText("teachers"));
  const params = onUrlUpdate.mock.calls.at(-1)?.[0].searchParams;
  expect(params.get("indicator")).toBe("teachers_total");
  expect(params.get("issue")).toBeNull();
  expect(params.get("issueMetric")).toBeNull();
});

it("restores search/level and preserves comparison while switching general indicators", async () => {
  const user = userEvent.setup();
  render(<MetricHarness />, { wrapper: withNuqsTestingAdapter({ searchParams: "?q=전주&schoolLevel=elem&region=52110&compareRegion=52130", hasMemory: true }) });
  expect(screen.getByTestId("filters")).toHaveTextContent("전주:elem:52130");
  await user.click(screen.getByText("teachers"));
  expect(screen.getByTestId("filters")).toHaveTextContent("전주:elem:52130");
  await user.click(screen.getByText("special-students"));
  expect(screen.getByTestId("filters")).toHaveTextContent(":all:52130");
});
