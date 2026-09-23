import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { contrastRatio, relativeLuminance, THEME } from "@/lib/theme";

/** KPI cards use the same opaque surface token as the sidebar panels. */
const KPI_TILE_BG = THEME.surface;

describe("THEME contrast (WCAG 2.1)", () => {
  it("body text pairs reach 4.5:1", () => {
    expect(contrastRatio(THEME.ink, THEME.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.ink, THEME.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.inkMuted, THEME.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.inkMuted, THEME.surface)).toBeGreaterThanOrEqual(4.5);
  });

  it("accent/positive on surface reach 3:1 — fills, rings and large text only, never small text", () => {
    expect(contrastRatio(THEME.accent, THEME.surface)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(THEME.positive, THEME.surface)).toBeGreaterThanOrEqual(3);
  });

  // Task 1 fix round 1 — the darker *-text variants exist precisely because
  // the 3:1 fill tokens above fall short of AA for the 10-12px text that
  // wears them (KPI deltas, 소규모 badge, RegionPanel's vs-province line).
  it("accentText/positiveText reach 4.5:1 on paper and surface (small text AA)", () => {
    expect(contrastRatio(THEME.accentText, THEME.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.accentText, THEME.surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.positiveText, THEME.paper)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.positiveText, THEME.surface)).toBeGreaterThanOrEqual(4.5);
  });

  // The two surfaces the *-text tokens actually sit on that are NOT paper or
  // surface: the KPI tile (ink 5% over paper) and the accent-soft badge fill.
  // Both *-text tokens must clear AA 4.5 on these surfaces too (measured
  // accentText 5.19 / 5.40, positiveText 5.01 / 5.21).
  it("accentText and positiveText ≥ 4.5 on the KPI tile fill and on accent-soft", () => {
    expect(contrastRatio(THEME.accentText, KPI_TILE_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.accentText, THEME.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.positiveText, KPI_TILE_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.positiveText, THEME.accentSoft)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.warningText, KPI_TILE_BG)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(THEME.warningText, THEME.warningSoft)).toBeGreaterThanOrEqual(4.5);
  });

  it("relativeLuminance: white 1, black 0", () => {
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
    expect(relativeLuminance("#000000")).toBeCloseTo(0, 6);
  });
});

describe("globals.css @theme tokens mirror THEME", () => {
  const css = readFileSync(path.join(process.cwd(), "src/app/globals.css"), "utf8");
  const cssToken = (name: string) => {
    const m = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
    return m?.[1].toLowerCase();
  };
  it.each([
    ["paper", THEME.paper],
    ["surface", THEME.surface],
    ["ink", THEME.ink],
    ["ink-muted", THEME.inkMuted],
    ["line", THEME.line],
    ["accent", THEME.accent],
    ["accent-soft", THEME.accentSoft],
    ["accent-text", THEME.accentText],
    ["positive", THEME.positive],
    ["positive-text", THEME.positiveText],
    ["warning", THEME.warning],
    ["warning-soft", THEME.warningSoft],
    ["warning-text", THEME.warningText],
  ] as const)("--color-%s equals THEME", (name, hex) => {
    // Guard first so a token missing from BOTH sides can't pass as
    // `undefined === undefined`.
    expect(hex).toMatch(/^#[0-9a-f]{6}$/);
    expect(cssToken(name)).toBe(hex);
  });
});
