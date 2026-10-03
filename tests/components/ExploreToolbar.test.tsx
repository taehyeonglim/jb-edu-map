import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { it, expect, vi } from "vitest";
import { withNuqsTestingAdapter } from "nuqs/adapters/testing";
import ExploreToolbar from "@/components/panels/ExploreToolbar";
import { useMapQuery } from "@/lib/state/urlState";

function Harness() {
  const query = useMapQuery();
  return (
    <>
      <button onClick={() => query.setSearch("전주")}>검색 입력</button>
      <ExploreToolbar title="학생수" />
    </>
  );
}

it("copies the latest search and the other active URL filters", async () => {
  const user = userEvent.setup();
  const copy = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
  render(<Harness />, {
    wrapper: withNuqsTestingAdapter({
      searchParams: "?region=52110&compareRegion=52130&schoolLevel=elem",
      hasMemory: true,
    }),
  });
  await user.click(screen.getByText("검색 입력"));
  await user.click(screen.getByText("링크 복사"));
  const url = new URL(copy.mock.calls[0][0]);
  expect(url.searchParams.get("q")).toBe("전주");
  expect(url.searchParams.get("schoolLevel")).toBe("elem");
  expect(url.searchParams.get("compareRegion")).toBe("52130");
  expect(screen.getByRole("status")).toHaveTextContent("링크를 복사했습니다.");
  copy.mockRestore();
});

it("offers a selectable link if clipboard permission is denied", async () => {
  const user = userEvent.setup();
  const copy = vi
    .spyOn(navigator.clipboard, "writeText")
    .mockRejectedValue(new Error("denied"));
  render(<Harness />, {
    wrapper: withNuqsTestingAdapter({
      searchParams: "?q=군산&schoolLevel=bad",
      hasMemory: true,
    }),
  });
  await user.click(screen.getByText("링크 복사"));
  const url = new URL(
    (screen.getByLabelText("공유 주소") as HTMLInputElement).value,
  );
  expect(url.searchParams.get("q")).toBe("군산");
  expect(url.searchParams.has("schoolLevel")).toBe(false);
  expect(screen.getByRole("status")).toHaveTextContent(
    "주소를 선택해 복사하세요.",
  );
  copy.mockRestore();
});
