"use client";

import { INDICATORS } from "@/lib/indicators/registry";
import { GROUP_LABELS, GROUP_ORDER } from "@/lib/indicators/groups";
import type { SeriesFile } from "@/lib/indicators/types";
import { displayLabel } from "@/lib/stats";

export interface IndicatorPickerProps {
  value: string;
  onChange: (id: string) => void;
  /**
   * bundle.series, used only to compute students_change_5y's dynamic
   * "{minYear}→{maxYear}" label span via displayLabel() (fix round 2,
   * finding 4) — matching what the menu button/Legend/RegionPanel header
   * already show for the same indicator. Optional and defaults to {}
   * (displayLabel() falls back to the static registry label when a series
   * is unavailable), mirroring IndicatorMenuProps.series's own default —
   * see its doc comment for why this stays optional.
   */
  series?: Record<string, SeriesFile>;
}

// One shared `name` across every group's radios (not per-fieldset): native
// HTML radio grouping is by `name`, not by `<fieldset>` boundary, so this is
// what keeps "only one indicator selected at a time" true across all 4
// visually-separate groups.
const RADIO_GROUP_NAME = "indicator";

/** Top-bar indicator selector: 4 grouped, keyboard-accessible radio sets (one radio per registered indicator). */
export default function IndicatorPicker({ value, onChange, series = {} }: IndicatorPickerProps) {
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
      {GROUP_ORDER.map((group) => {
        const items = INDICATORS.filter((d) => d.group === group);
        if (items.length === 0) return null;
        return (
          <fieldset key={group} className="m-0 flex min-w-0 w-full flex-wrap items-start gap-2 border-0 p-0">
            <legend className="mr-1 text-[11px] uppercase tracking-wide text-ink-muted">
              {GROUP_LABELS[group]}
            </legend>
            {items.map((def) => {
              const checked = value === def.id;
              const descriptionId = `indicator-description-${def.id}`;
              return (
                // Task 5, Section C — def.description renders small, just
                // below the radio+label (Korean "옆에": visually adjacent,
                // not literally same-line, given how many chips already
                // wrap here). It's a SIBLING of the <label>, not nested
                // inside it: text content inside a <label> becomes part of
                // its wrapped <input>'s accessible NAME (confirmed against
                // this file's own precedent below — combining id/htmlFor
                // duplicates the name the same way), which would silently
                // break every `getByRole("radio", { name: def.label })`
                // query in IndicatorPicker.test.tsx/IndicatorMenu.test.tsx.
                // `aria-describedby` links it as the accessible DESCRIPTION
                // instead, leaving the NAME exactly `def.label`.
                <div key={def.id} className="flex flex-col">
                  <label
                    className={`cursor-pointer rounded px-2 py-1 text-xs transition-colors ${
                      checked ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-ink/5"
                    }`}
                  >
                    <input
                      type="radio"
                      name={RADIO_GROUP_NAME}
                      value={def.id}
                      checked={checked}
                      onChange={() => onChange(def.id)}
                      aria-describedby={descriptionId}
                      className="mr-1 align-middle accent-accent"
                    />
                    {displayLabel(def, series)}
                  </label>
                  <span id={descriptionId} className="max-w-[220px] pl-2 text-[10px] leading-snug text-ink-muted">
                    {def.description}
                  </span>
                </div>
              );
            })}
          </fieldset>
        );
      })}
    </div>
  );
}
