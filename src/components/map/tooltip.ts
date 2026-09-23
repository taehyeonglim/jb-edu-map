import type { PickingInfo } from "@deck.gl/core";

import { HUD_THEME, THEME } from "@/lib/theme";
import type { School } from "@/lib/schools/types";

export interface TooltipResult {
  html: string;
  style: Partial<CSSStyleDeclaration>;
}

const TOOLTIP_STYLE: Partial<CSSStyleDeclaration> = {
  background: THEME.surface,
  color: THEME.ink,
  border: `1px solid ${THEME.line}`,
  borderRadius: `${HUD_THEME.radius}px`,
  padding: "8px 10px",
  fontSize: "13px",
};

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch]);
}

/** Shared line-list -> tooltip HTML assembly: the first line renders bold as the title, every subsequent line as its own `<div>` (a single line with an embedded "\n" can't be split into separate HTML lines, hence the list shape instead of one formatted string). */
function renderLines(lines: string[]): TooltipResult {
  const [title, ...rest] = lines;
  const body = rest.map((line) => `<div>${escapeHtml(line)}</div>`).join("");
  return {
    html: `<div><strong>${escapeHtml(title)}</strong>${body}</div>`,
    style: TOOLTIP_STYLE,
  };
}

/**
 * Builds a deck.gl `getTooltip` callback for the region (GeoJsonLayer)
 * layers. `linesOf` is the injection point (like the layer factories'
 * `elevationOf`/`fillColorOf`): DeckMap.tsx builds [name, "label: value
 * 단위", "{N}개 시군 중 n위", "전북 평균 대비 ±x" (ratio-kind) 또는 "전북 대비
 * 비중 x%" (count-kind, Task 5 Section D)] for the real indicator — see
 * tooltipText.ts's makeLinesOf for the exact rule. `linesOf` returning null
 * (or an empty array) suppresses the tooltip, same as no code being hovered.
 */
export function makeTooltip(linesOf: (code: string) => string[] | null) {
  return (info: PickingInfo): TooltipResult | null => {
    const code = (info.object as { properties?: { code?: string } } | undefined)?.properties?.code;
    if (!code) return null;
    const lines = linesOf(code);
    if (!lines || lines.length === 0) return null;
    return renderLines(lines);
  };
}

/**
 * Builds a deck.gl `getTooltip` callback for the `schools` ColumnLayer —
 * `info.object` is a plain `School` row (no `.properties` wrapper, unlike
 * the GeoJsonLayer-backed region tooltip above), so it needs its own
 * picking-info reader. `linesOf` is `schoolTooltipLines` from
 * src/lib/tooltipText.ts (pure, unit tested there).
 */
export function makeSchoolTooltip(linesOf: (school: School) => string[]) {
  return (info: PickingInfo): TooltipResult | null => {
    const school = info.object as School | undefined;
    if (!school) return null;
    const lines = linesOf(school);
    if (lines.length === 0) return null;
    return renderLines(lines);
  };
}
