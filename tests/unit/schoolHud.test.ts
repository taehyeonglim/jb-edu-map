import { describe, expect, it } from "vitest";
import { placeSchoolHud, type HudRect } from "@/components/map/useHudLayout";

const overlaps = (a: HudRect, b: HudRect) => a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top;

describe("학교 HUD 충돌 방지", () => {
  it("학교가 지도 가장자리에 있어도 카드와 연결선 끝점이 화면 안에 남는다", () => {
    const card = placeSchoolHud([790, 590], { width: 800, height: 600 }, { width: 304, height: 260 }, []);
    expect(card.left).toBeGreaterThanOrEqual(12);
    expect(card.left + card.width).toBeLessThanOrEqual(788);
    expect(card.top + card.height).toBeLessThanOrEqual(588);
    expect(card.stemX).toBeGreaterThanOrEqual(card.left);
    expect(card.stemY).toBeLessThanOrEqual(card.top + card.height);
  });

  it("모바일 상단·설정·범례를 피하면서 긴 학교 정보는 스크롤 높이로 줄인다", () => {
    const obstacles = [
      { left: 0, top: 0, width: 360, height: 168 },
      { left: 12, top: 180, width: 336, height: 140 },
      { left: 80, top: 540, width: 268, height: 88 },
    ];
    const card = placeSchoolHud([180, 460], { width: 360, height: 640 }, { width: 304, height: 320 }, obstacles);
    expect(obstacles.some((obstacle) => overlaps(card, obstacle))).toBe(false);
    expect(card.height).toBeLessThan(320);
    expect(card.height).toBeGreaterThanOrEqual(96);
  });
});
