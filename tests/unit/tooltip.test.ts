import { describe, expect, it } from "vitest";
import type { PickingInfo } from "@deck.gl/core";

import { makeTooltip } from "@/components/map/tooltip";
import { THEME } from "@/lib/theme";

function infoFor(code: string | undefined): PickingInfo {
  return {
    object: code === undefined ? undefined : { properties: { code } },
  } as unknown as PickingInfo;
}

describe("makeTooltip", () => {
  it("returns null when nothing is hovered", () => {
    const getTooltip = makeTooltip(() => ["전주시", "학생수: 70,444명"]);
    expect(getTooltip(infoFor(undefined))).toBeNull();
  });

  it("returns null when linesOf returns null for the hovered code", () => {
    const getTooltip = makeTooltip(() => null);
    expect(getTooltip(infoFor("52110"))).toBeNull();
  });

  // The brief's tooltip spec is 4 distinct lines: name / label:value / rank /
  // vsProvince — a single <div> with an embedded "\n" (the old 2-line shape)
  // can't render that as separate visual lines in HTML, so makeTooltip takes
  // a full line list instead of separate name/value accessors.
  it("renders every line as HTML, with the first line bold as the title", () => {
    const getTooltip = makeTooltip((code) => [
      `이름:${code}`,
      `학생수: 70,444명`,
      `14개 시군 중 1위`,
      `전북 평균 대비 +5,000`,
    ]);
    const result = getTooltip(infoFor("52110"));
    expect(result).not.toBeNull();
    expect(result?.html).toContain("<strong>이름:52110</strong>");
    expect(result?.html).toContain("<div>학생수: 70,444명</div>");
    expect(result?.html).toContain("<div>14개 시군 중 1위</div>");
    expect(result?.html).toContain("<div>전북 평균 대비 +5,000</div>");
  });

  it("HTML-escapes every line", () => {
    const getTooltip = makeTooltip(() => ["<script>alert(1)</script>", "a & b"]);
    const result = getTooltip(infoFor("52110"));
    expect(result?.html).not.toContain("<script>");
    expect(result?.html).toContain("&lt;script&gt;");
    expect(result?.html).toContain("a &amp; b");
  });

  it("uses the control-room tooltip card style", () => {
    const getTooltip = makeTooltip(() => ["전주시", "값"]);
    const result = getTooltip(infoFor("52110"));
    expect(result?.style).toMatchObject({
      background: THEME.surface,
      color: THEME.ink,
      border: `1px solid ${THEME.line}`,
      borderRadius: "3px",
      padding: "8px 10px",
      fontSize: "13px",
    });
  });
});
