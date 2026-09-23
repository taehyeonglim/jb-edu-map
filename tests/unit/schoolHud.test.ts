import { describe, expect, it } from "vitest";
import { schoolHudPosition } from "@/components/map/SchoolHud";

describe("schoolHudPosition", () => {
  const viewport = { width: 800, height: 600 };
  const card = { width: 304, height: 228 };

  it("학교 위에 카드를 놓고 지도 가장자리 안에 유지한다", () => {
    expect(schoolHudPosition([400, 400], viewport, card)).toEqual({ left: 248, top: 150, stemX: 400, stemY: 378 });
    const edge = schoolHudPosition([790, 590], viewport, card);
    expect(edge.left).toBe(484);
    expect(edge.top).toBe(340);
    expect(edge.stemX).toBe(770);
  });

  it("상단 학교는 아래쪽에 배치한다", () => {
    expect(schoolHudPosition([30, 30], viewport, card)).toEqual({ left: 12, top: 52, stemX: 30, stemY: 52 });
  });
});
