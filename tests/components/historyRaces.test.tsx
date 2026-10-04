import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import { useMapQuery } from "@/lib/state/urlState";

let clockStart = 0;
beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] });
  // nuqs retains its last flush timestamp across adapter mounts. Keep the
  // mocked monotonic clock moving forward across tests too.
  clockStart += 1000;
  await vi.advanceTimersByTimeAsync(clockStart);
});
afterEach(() => vi.useRealTimers());

function HistoryHarness() {
  const query = useMapQuery();
  return <>
    <output>{query.search}</output>
    <button onClick={() => query.setSearch("전")}>prefix</button>
    <button onClick={() => query.setSearch("전주초등학교")}>complete</button>
    <button onClick={() => query.setSchoolLevel("elem")}>elementary</button>
    <button onClick={() => query.setView("statistics")}>statistics</button>
    <button onClick={() => query.setIssue("special-education")}>special</button>
    <button onClick={() => query.setRegion("52110")}>select</button>
    <button onClick={() => query.setRegion(null)}>clear</button>
  </>;
}

it("keeps the latest search in the previous entry when navigation happens during URL throttling", async () => {
  const onUrlUpdate = vi.fn();
  render(<HistoryHarness />, { wrapper: withNuqsTestingAdapter({ hasMemory: true, rateLimitFactor: 1, onUrlUpdate }) });
  fireEvent.click(screen.getByText("prefix"));
  await act(() => vi.advanceTimersByTimeAsync(1));
  fireEvent.click(screen.getByText("complete"));
  await act(() => vi.advanceTimersByTimeAsync(1));
  fireEvent.click(screen.getByText("statistics"));
  await act(() => vi.advanceTimersByTimeAsync(200));

  expect(onUrlUpdate.mock.calls.map(([update]) => ({
    search: update.searchParams.get("q"),
    view: update.searchParams.get("view"),
    history: update.options.history,
  }))).toEqual([
    { search: "전", view: null, history: "replace" },
    { search: "전주초등학교", view: null, history: "replace" },
    { search: "전주초등학교", view: "statistics", history: "push" },
  ]);
});

it.each([
  { action: "statistics", initial: "", key: "view", value: "statistics" },
  { action: "special", initial: "", key: "issue", value: "special-education" },
  { action: "select", initial: "", key: "region", value: "52110" },
  { action: "clear", initial: "?region=52110", key: "region", value: null },
])("preserves the latest school level before $action pushes history", async ({ action, initial, key, value }) => {
  const onUrlUpdate = vi.fn();
  render(<HistoryHarness />, { wrapper: withNuqsTestingAdapter({ searchParams: initial, hasMemory: true, rateLimitFactor: 1, onUrlUpdate }) });
  fireEvent.click(screen.getByText("prefix"));
  await act(() => vi.advanceTimersByTimeAsync(1));
  fireEvent.click(screen.getByText("elementary"));
  await act(() => vi.advanceTimersByTimeAsync(1));
  fireEvent.click(screen.getByText(action));
  await act(() => vi.advanceTimersByTimeAsync(200));

  const updates = onUrlUpdate.mock.calls.map(([update]) => update);
  expect(updates).toHaveLength(3);
  expect(updates[1].options.history).toBe("replace");
  expect(updates[1].searchParams.get("schoolLevel")).toBe("elem");
  expect(updates[1].searchParams.get(key)).toBe(new URLSearchParams(initial).get(key));
  expect(updates[2].options.history).toBe("push");
  expect(updates[2].searchParams.get(key)).toBe(value);
  // A new issue intentionally clears school filters, but Back restores them.
  expect(updates[2].searchParams.get("schoolLevel")).toBe(action === "special" ? null : "elem");
});
