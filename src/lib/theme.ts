/**
 * 현황판 테마 토큰의 단일 원천. globals.css 의 @theme 블록은 이 값을 그대로
 * 복제한다(테스트가 두 곳의 일치를 검사). 지도 레이어는 이 파일을 직접
 * import 하지 않고 스펙의 RGB 리터럴을 쓴다(레이어 테스트가 리터럴을 고정).
 */
export const THEME = {
  paper: "#081421",
  surface: "#122438",
  ink: "#ebf5fc",
  inkMuted: "#afc2d0",
  line: "#36526a",
  accent: "#43cfe0",
  accentSoft: "#173d4b",
  positive: "#37bd9f",
  // Lighter variants for small text on the night surfaces; the warning tone
  // stays separate from the cyan selection accent.
  accentText: "#83e6ef",
  positiveText: "#82e2c7",
  warning: "#f28c62",
  warningSoft: "#452d2b",
  warningText: "#ffb190",
} as const;

export type ThemeToken = keyof typeof THEME;

/** Surfaces shared with the control-room CSS; data colors retain their meaning. */
export const HUD_THEME = {
  panelFill: "rgba(8, 23, 35, .96)",
  panelRaised: "#102b3b",
  border: THEME.line,
  radius: 3,
  transitionMs: 180,
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const m = /^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/.exec(hex);
  if (!m) throw new Error(`theme: not a #rrggbb color: ${hex}`);
  return [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)];
}

function channel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

/** WCAG 2.1 relative luminance of a #rrggbb color (0 = black, 1 = white). */
export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** WCAG 2.1 contrast ratio (1..21) between two #rrggbb colors, order-independent. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  const [hi, lo] = la >= lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
