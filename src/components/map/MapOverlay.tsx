"use client";

import { useRef, type ReactNode, type KeyboardEvent } from "react";

/** A press/unpress chip (`aria-pressed`). `kind` is optional so the original item shape (Task A/C/E callers and tests) keeps working unchanged. */
export interface MapOverlayToggleItem {
  kind?: "toggle";
  id: string;
  label: string;
  pressed: boolean;
  onToggle: () => void;
  /** Native `title` attribute — used as a plain tooltip. */
  title?: string;
}

/**
 * Task 3 (bright diorama) — a segmented control: one `role="radiogroup"`
 * named by `label`, one `role="radio"` per option, exactly one checked
 * (`value`). Used for the 3-way "배경 지도" (끄기 / 위성 / 일반) selector.
 */
export interface MapOverlaySegmentedItem<V extends string = string> {
  kind: "segmented";
  id: string;
  /** The radiogroup's accessible name (e.g. "배경 지도") — not rendered as visible text. */
  label: string;
  value: V;
  options: { value: V; label: string }[];
  /**
   * Method-style on purpose (not `onChange: (value: V) => void`): under
   * `strictFunctionTypes` a property-typed callback is checked
   * contravariantly, so DeckMap's `(mode: BasemapMode) => void` couldn't be
   * assigned once the item sits in a `MapOverlayItem[]` (V widens to
   * `string`). Method parameters are bivariant, which is the intended
   * escape hatch here — the values passed back always come from `options`.
   */
  onChange(value: V): void;
  /** Native `title` attribute on the group — used as a plain tooltip. */
  title?: string;
}

export type MapOverlayItem = MapOverlayToggleItem | MapOverlaySegmentedItem;

export interface MapOverlayProps {
  /**
   * One control per item, rendered left-to-right in the given order.
   * Deliberately an array of generic items (not fixed named props for "발표
   * 모드" specifically) — Task A only ever passed one item, Task C appended
   * a "배경 지도" button and source-attribution text, Task E a "읍면동 경계"
   * button, and Task 3 (bright diorama) turned the basemap entry into a
   * segmented radiogroup, all without changing this shape.
   */
  items: MapOverlayItem[];
  collapsible?: boolean;
  expanded?: boolean;
  onExpandedChange?: (open: boolean) => void;
  /**
   * Task C — an optional small caption rendered below the button row (the
   * VWorld basemap tile source attribution, shown only while the basemap is
   * on). Purely presentational: this component doesn't know or care what
   * the text is for, or which `items` entry (if any) it's paired with —
   * DeckMap owns that pairing.
   */
  attribution?: string;
  children?: ReactNode;
}

/**
 * Task A — a small toggle-button cluster pinned to the map's top-right
 * corner. Rendered by DeckMap just after `<DeckGL>` (see DeckMap.tsx), so it
 * sits visually on top of the canvas; `pointer-events-none` on the
 * wrapper (with `pointer-events-auto` on each button/group) keeps the gaps
 * between controls from swallowing deck.gl's own drag/click gestures.
 *
 * Purely controlled — no state of its own. The caller (DeckMap) owns
 * `pressed`/`onToggle` per toggle item and `value`/`onChange` per segmented
 * item (e.g. its local, session-only `presentation` `useState`, or the
 * persisted basemap mode). DeckMap itself is only ever mounted client-side
 * (`ssr:false` — see MapShell.tsx) and this is only ever rendered as ITS
 * child, so in fallback mode (DeckMap not rendered at all) this is
 * automatically absent too — no separate fallback-mode check needed here.
 */
export default function MapOverlay({
  items,
  attribution,
  children,
  collapsible = false,
  expanded,
  onExpandedChange,
}: MapOverlayProps) {
  if (items.length === 0 && !attribution && !children) return null;

  return (
    <div data-map-obstacle="settings" className="cyber-settings pointer-events-none flex max-w-[calc(100%_-_24px)] flex-col items-end gap-1.5">
      <details
        open={collapsible ? expanded : true}
        onToggle={(event) => onExpandedChange?.(event.currentTarget.open)}
        className="pointer-events-auto max-w-full"
      >
        <summary
          className={
            collapsible
              ? "cyber-frame ml-auto w-fit cursor-pointer px-3 py-2.5 text-xs"
              : "hidden"
          }
        >
          지도 설정
        </summary>
        {items.length > 0 && (
          <div className="flex max-w-[250px] sm:max-w-[calc(100vw-24px)] flex-wrap justify-end gap-1.5">
            {items.map((item) =>
              item.kind === "segmented" ? (
                <SegmentedRadioGroup key={item.id} item={item} />
              ) : (
                <button
                  key={item.id}
                  type="button"
                  aria-pressed={item.pressed}
                  title={item.title}
                  onClick={item.onToggle}
                  className={`pointer-events-auto rounded min-h-11 px-2.5 py-1 text-xs backdrop-blur-sm transition-colors ${
                    item.pressed
                      ? "border border-accent/40 bg-accent-soft font-semibold text-ink shadow-sm"
                      : "border border-line bg-surface/85 text-ink-muted shadow-sm hover:bg-surface"
                  }`}
                >
                  {item.label}
                </button>
              ),
            )}
          </div>
        )}
      </details>
      {attribution && (
        <div
          data-testid="basemap-attribution"
          className="max-w-full rounded border border-line bg-surface/85 px-2 py-0.5 text-[10px] text-ink-muted shadow-sm backdrop-blur-sm"
        >
          {attribution}
        </div>
      )}
      {children}
    </div>
  );
}

/**
 * Task 3 — the segmented control, following the WAI-ARIA radiogroup
 * keyboard pattern (fix round 1): a roving tabindex (only the checked
 * radio — or the first one, if nothing is checked — is a Tab stop, so the
 * whole group costs one Tab) plus ArrowLeft/ArrowUp → previous and
 * ArrowRight/ArrowDown → next (both wrapping) and Home/End → first/last.
 * Moving calls `onChange(value)` and then focuses the target button
 * directly (via the ref array — focus works on a `tabIndex={-1}` button;
 * the parent's re-render then flips its tabIndex to 0). Enter/Space are
 * left to the native <button> so they still activate the focused option.
 *
 * Same surface language as the chips (line border, translucent surface,
 * shadow); the checked segment reuses the pressed-chip fill so "selected"
 * reads the same across both control kinds. The focus ring is `ring-inset`
 * because the group clips its children (`overflow-hidden` for the rounded
 * corners) — an outset ring would be cut off.
 *
 * A separate component (not inline in `items.map`) only because it needs a
 * `useRef` of its own per group; it is still purely controlled.
 */
function SegmentedRadioGroup({ item }: { item: MapOverlaySegmentedItem }) {
  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = item.options.findIndex(
    (opt) => opt.value === item.value,
  );
  const tabStopIndex = checkedIndex === -1 ? 0 : checkedIndex;

  const moveTo = (index: number) => {
    const opt = item.options[index];
    if (!opt) return;
    item.onChange(opt.value);
    buttonRefs.current[index]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const count = item.options.length;
    if (count === 0) return;
    // Leave browser/OS chords alone (Alt/Cmd+Arrow = Back/Forward, etc.).
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    // Move relative to the FOCUSED radio (WAI-ARIA), falling back to the
    // checked one when focus is not on a radio.
    const focusedIndex = buttonRefs.current.indexOf(
      document.activeElement as HTMLButtonElement | null,
    );
    const fromIndex = focusedIndex >= 0 ? focusedIndex : tabStopIndex;
    let next: number;
    switch (event.key) {
      case "ArrowRight":
      case "ArrowDown":
        next = (fromIndex + 1) % count;
        break;
      case "ArrowLeft":
      case "ArrowUp":
        next = (fromIndex - 1 + count) % count;
        break;
      case "Home":
        next = 0;
        break;
      case "End":
        next = count - 1;
        break;
      default:
        return; // Enter/Space/Tab/…: native button behavior, untouched.
    }
    event.preventDefault(); // keep the arrows from scrolling the page / Home-End from jumping it
    moveTo(next);
  };

  return (
    <div
      role="radiogroup"
      aria-label={item.label}
      title={item.title}
      onKeyDown={onKeyDown}
      className="pointer-events-auto flex overflow-hidden rounded border border-line bg-surface/85 shadow-sm backdrop-blur-sm"
    >
      {item.options.map((opt, index) => {
        const checked = index === checkedIndex;
        return (
          <button
            key={opt.value}
            ref={(el) => {
              buttonRefs.current[index] = el;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === tabStopIndex ? 0 : -1}
            onClick={() => item.onChange(opt.value)}
            className={`min-h-11 px-2.5 py-1 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent ${
              checked
                ? "bg-accent-soft font-semibold text-ink"
                : "text-ink-muted hover:bg-surface"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
